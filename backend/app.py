import asyncio
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from io import BytesIO

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings
from .muse import MuseClient, MuseError, UnsupportedAudioError
from .schemas import Analysis, Detection, Profile
from .state import StateEngine


MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_REQUEST_BYTES = 6 * 1024 * 1024


class BodyLimitMiddleware:
    """Bound multipart input before the parser writes uploaded files to disk."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > MAX_REQUEST_BYTES:
                response = JSONResponse({"error": "Request must be at most 6 MiB."}, status_code=400)
                return await response(scope, receive, send)
            if not message.get("more_body", False):
                break
        sent = False

        async def buffered_receive():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, buffered_receive, send)


def capture_time(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            raise ValueError("Timezone missing")
        return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    except (ValueError, OverflowError):
        raise HTTPException(400, "timestamp must be an ISO-8601 date and time with a timezone.") from None


def validate_jpeg(data: bytes):
    if not data:
        raise HTTPException(400, "image must contain a JPEG frame.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if image.format != "JPEG":
                    raise HTTPException(400, "image must be a JPEG.")
                if image.width > 960 or image.height > 4096:
                    raise HTTPException(400, "image must be at most 960 pixels wide and 4096 pixels high.")
                # Decode to catch truncated or corrupt JPEG payloads, not just headers.
                image.load()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(400, "image is not a valid JPEG.") from None


async def read_upload(upload: UploadFile) -> bytes:
    try:
        data = await upload.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(400, "Uploaded files must be at most 5 MiB.")
        return data
    finally:
        await upload.close()


def create_app(settings: Settings | None = None, detector=None, engine=None) -> CORSMiddleware:
    settings = settings or Settings.load()

    @asynccontextmanager
    async def lifespan(app):
        app.state.engine = engine or StateEngine()
        app.state.detector = detector or MuseClient(settings.api_key, settings.base_url, settings.model)
        app.state.frame_lock = asyncio.Lock()
        try:
            yield
        finally:
            await app.state.engine.close()
            await app.state.detector.close()

    app = FastAPI(title="OmniMind demo backend", version="0.1.0", lifespan=lifespan)
    app.add_middleware(BodyLimitMiddleware)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Validation errors may include user input (profile gate codes, audio,
        # images). Return only field names, never their values.
        fields = ", ".join(dict.fromkeys(str(error["loc"][-1]) for error in exc.errors()))
        return JSONResponse({"error": f"Invalid or missing request field: {fields}."}, status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        return JSONResponse({"error": "An internal server error occurred."}, status_code=500)

    @app.get("/health")
    async def health():
        return {"ok": True, "model_configured": bool(settings.api_key), "model": settings.model}

    @app.post("/frame", response_model=Detection)
    async def frame(image: UploadFile = File(...), timestamp: str = Form(...)):
        timestamp = capture_time(timestamp)
        data = await read_upload(image)
        validate_jpeg(data)
        if app.state.frame_lock.locked():
            raise HTTPException(400, "Another frame is being analyzed; retry after it completes.")
        async with app.state.frame_lock:
            try:
                async with asyncio.timeout(26):
                    result = await app.state.detector.analyze(data)
                analysis = Analysis.model_validate(result)
            except (MuseError, TimeoutError, ValidationError):
                # Provider output is untrusted and can contain request data.
                # A failed analysis must never be represented as a clear scene.
                message = "Frame analysis failed. Check backend model configuration and try again."
                if not settings.api_key and detector is None:
                    message = "Set MODEL_API_KEY as an environment variable or in backend/.env and restart the backend."
                raise HTTPException(500, message) from None
            detection = {**analysis.model_dump(), "timestamp": timestamp}
            app.state.engine.record_detection(detection)
            return detection

    @app.get("/state")
    async def state():
        return app.state.engine.snapshot()

    @app.post("/ack")
    async def acknowledge():
        return app.state.engine.acknowledge()

    @app.post("/profile")
    async def profile(value: Profile):
        app.state.engine.set_profile(value.model_dump())
        return {"ok": True}

    @app.post("/ask")
    async def ask(text: str = Form(""), audio: UploadFile | None = File(None)):
        text = text.strip()
        if len(text) > 8000:
            raise HTTPException(400, "text must be at most 8000 characters.")
        audio_type = audio.content_type if audio else None
        data = await read_upload(audio) if audio else None
        if not text and not data:
            raise HTTPException(400, "Provide a question in text or a supported audio recording.")
        try:
            async with asyncio.timeout(26):
                answer = await app.state.detector.ask(text, app.state.engine.snapshot(), data, audio_type)
        except UnsupportedAudioError as exc:
            raise HTTPException(400, str(exc)) from None
        except (MuseError, TimeoutError):
            raise HTTPException(500, "Question answering failed. Check backend model configuration and try again.") from None
        return {"text": answer}

    # Wrap the complete application so even unexpected server errors have CORS
    # headers; FastAPI's outer ServerErrorMiddleware otherwise bypasses them.
    return CORSMiddleware(
        app,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        allow_credentials=False,
    )


app = create_app()
