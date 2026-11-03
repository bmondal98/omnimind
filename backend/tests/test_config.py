from backend.config import Settings


def write_env(tmp_path, text):
    path = tmp_path / ".env"
    path.write_text(text, encoding="utf-8")
    return path


def test_env_file_is_used_when_no_environment_variables(tmp_path):
    env_file = write_env(
        tmp_path,
        "MODEL_API_KEY=file-key\nMODEL_API_BASE_URL=https://file.example/v1/\n"
        "MODEL_API_MODEL=file-model\nCORS_ORIGINS=http://a.test, http://b.test\n",
    )
    settings = Settings.load(env_file, environ={})
    assert settings.api_key == "file-key"
    assert settings.base_url == "https://file.example/v1"
    assert settings.model == "file-model"
    assert settings.cors_origins == ("http://a.test", "http://b.test")


def test_environment_variables_take_priority_over_env_file(tmp_path):
    env_file = write_env(
        tmp_path,
        "MODEL_API_KEY=file-key\nMODEL_API_MODEL=file-model\nCORS_ORIGINS=http://file.test\n",
    )
    environ = {
        "MODEL_API_KEY": "env-key",
        "MODEL_API_BASE_URL": "https://env.example/v1",
        "CORS_ORIGINS": "https://app.example",
    }
    settings = Settings.load(env_file, environ=environ)
    assert settings.api_key == "env-key"
    assert settings.base_url == "https://env.example/v1"
    assert settings.model == "file-model"  # not in environ, so the file still applies
    assert settings.cors_origins == ("https://app.example",)


def test_empty_environment_variable_falls_back_to_env_file(tmp_path):
    env_file = write_env(tmp_path, "MODEL_API_KEY=file-key\n")
    assert Settings.load(env_file, environ={"MODEL_API_KEY": "  "}).api_key == "file-key"


def test_environment_only_without_env_file(tmp_path):
    settings = Settings.load(tmp_path / "missing.env", environ={"MODEL_API_KEY": "env-key"})
    assert settings.api_key == "env-key"
    assert settings.base_url == Settings.base_url
    assert settings.model == Settings.model
    assert settings.cors_origins == ("*",)


def test_defaults_with_nothing_configured(tmp_path):
    assert Settings.load(None, environ={}) == Settings()


def test_reads_process_environment_by_default(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_API_MODEL", "process-model")
    assert Settings.load(tmp_path / "missing.env").model == "process-model"


def test_api_key_is_not_in_repr():
    assert "secret-value" not in repr(Settings(api_key="secret-value"))
