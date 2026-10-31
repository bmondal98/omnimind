import { useEffect, useRef, useState } from 'react';
import { CloseIcon, PlusIcon, TrashIcon } from './Icons.jsx';

let nextContactKey = 0;
const withKey = (contact) => ({ ...contact, key: nextContactKey++ });

const FIELDS = [
  { name: 'owner_name', label: 'Owner name', autoComplete: 'off' },
  { name: 'owner_phone', label: 'Owner phone', type: 'tel', autoComplete: 'off' },
  { name: 'address', label: 'Address', autoComplete: 'off' },
  { name: 'gate_code', label: 'Gate / door code', autoComplete: 'off' },
];

// "Active Memory": the home details the agent uses when it calls for help.
export default function ProfilePanel({ profile, onSave, onClose }) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(() => ({ ...profile, contacts: profile.contacts.map(withKey) }));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const setContact = (key, name, value) =>
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact) => (contact.key === key ? { ...contact, [name]: value } : contact)),
    }));

  const addContact = () =>
    setForm((prev) => ({ ...prev, contacts: [...prev.contacts, withKey({ name: '', relation: '', phone: '' })] }));

  const removeContact = (key) =>
    setForm((prev) => ({ ...prev, contacts: prev.contacts.filter((contact) => contact.key !== key) }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const contacts = form.contacts
      .map(({ name, relation, phone }) => ({ name: name.trim(), relation: relation.trim(), phone: phone.trim() }))
      .filter((contact) => contact.name || contact.relation || contact.phone);

    setIsSaving(true);
    setError('');
    try {
      await onSave({
        owner_name: form.owner_name.trim(),
        owner_phone: form.owner_phone.trim(),
        address: form.address.trim(),
        gate_code: form.gate_code.trim(),
        contacts,
      });
      onClose();
    } catch (err) {
      console.error('[profile] saveProfile failed', err);
      setError("Saved on this device, but the OmniMind backend couldn't be reached. Try again.");
      setIsSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="profile"
      aria-labelledby="profile-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose(); // click on the backdrop
      }}
    >
      <form className="profile__form" onSubmit={handleSubmit}>
        <header className="profile__header">
          <div>
            <h2 id="profile-title">Home profile</h2>
            <p>Active Memory: what OmniMind knows when it calls for help.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="profile__scroll">
          {FIELDS.map(({ name, label, type = 'text', autoComplete }) => (
            <label key={name} className="field">
              <span>{label}</span>
              <input
                type={type}
                value={form[name]}
                onChange={(e) => setField(name, e.target.value)}
                autoComplete={autoComplete}
              />
            </label>
          ))}

          <h3 className="profile__subheading">Contacts</h3>
          <p className="profile__hint">OmniMind calls these people in order before it dispatches help.</p>
          <ul className="contacts">
            {form.contacts.map((contact) => (
              <li key={contact.key} className="contact">
                <input
                  value={contact.name}
                  onChange={(e) => setContact(contact.key, 'name', e.target.value)}
                  placeholder="Name"
                  aria-label="Contact name"
                  autoComplete="off"
                />
                <input
                  value={contact.relation}
                  onChange={(e) => setContact(contact.key, 'relation', e.target.value)}
                  placeholder="Relation"
                  aria-label="Contact relation"
                  autoComplete="off"
                />
                <input
                  type="tel"
                  value={contact.phone}
                  onChange={(e) => setContact(contact.key, 'phone', e.target.value)}
                  placeholder="Phone"
                  aria-label="Contact phone"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => removeContact(contact.key)}
                  aria-label={`Remove ${contact.name || 'contact'}`}
                >
                  <TrashIcon width={18} height={18} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="profile__add" onClick={addContact}>
            <PlusIcon width={18} height={18} /> Add contact
          </button>
        </div>

        <footer className="profile__footer">
          {error && (
            <p className="agent__error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--primary" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
