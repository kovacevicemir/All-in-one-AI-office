import { useEffect, useState, type FormEvent } from 'react';
import {
  AGENT_PROFILE_MAX_DESCRIPTION,
  AGENT_PROFILE_MAX_INSTRUCTIONS,
  type AgentProfile,
} from '@ai-office/contracts';
import type { ProfileSaveResult } from '../runtime/store.js';

export interface AgentProfileEditorProps {
  agentId: string;
  /** The stored profile once it has been read; undefined while it loads. */
  profile: AgentProfile | undefined;
  /** Asks the store to read the agent's saved profile. */
  onLoad(): void;
  onSave(profile: AgentProfile): Promise<ProfileSaveResult>;
}

/**
 * Per-agent description and instructions. A rejected save keeps the editor's
 * text so nothing typed is lost, and the error is shown next to the form.
 */
export function AgentProfileEditor({ agentId, profile, onLoad, onSave }: AgentProfileEditorProps) {
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // A new agent starts from a clean slate and fetches its own saved values.
  useEffect(() => {
    setDescription('');
    setInstructions('');
    setError(null);
    setSaved(false);
    onLoad();
    // Intentionally keyed on the agent only: onLoad is a stable store action.
  }, [agentId]);

  // When the stored profile arrives, or a different agent is selected, load it.
  useEffect(() => {
    if (profile === undefined) return;
    setDescription(profile.description);
    setInstructions(profile.instructions);
  }, [agentId, profile?.description, profile?.instructions]);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await onSave({ description, instructions });
    setSaving(false);
    if (result.ok) setSaved(true);
    else setError(result.error ?? 'The profile could not be saved');
  };

  return (
    <section aria-label="Agent profile">
      <h3>Profile</h3>
      <form className="profile-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="profile-description">Description</label>
        <input
          id="profile-description"
          type="text"
          value={description}
          maxLength={AGENT_PROFILE_MAX_DESCRIPTION}
          onChange={(event) => setDescription(event.target.value)}
        />

        <label htmlFor="profile-instructions">Instructions</label>
        <textarea
          id="profile-instructions"
          rows={6}
          value={instructions}
          maxLength={AGENT_PROFILE_MAX_INSTRUCTIONS}
          onChange={(event) => setInstructions(event.target.value)}
        />

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      {saved ? (
        <p className="muted small" role="status" data-testid="profile-saved">
          Profile saved
        </p>
      ) : null}
      {error !== null ? (
        <p className="notice error" role="alert" data-testid="profile-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
