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
        <div className="field">
          <div className="field-head">
            <label htmlFor="profile-description">Description</label>
            <span className="counter" aria-hidden="true">
              {description.length} / {AGENT_PROFILE_MAX_DESCRIPTION}
            </span>
          </div>
          <input
            id="profile-description"
            type="text"
            value={description}
            maxLength={AGENT_PROFILE_MAX_DESCRIPTION}
            placeholder="Tech lead for the payments squad"
            onChange={(event) => setDescription(event.target.value)}
          />
          <p className="hint">Shown in the office. The model never sees it.</p>
        </div>

        <div className="field">
          <div className="field-head">
            <label htmlFor="profile-instructions">Instructions</label>
            <span className="counter" aria-hidden="true">
              {instructions.length} / {AGENT_PROFILE_MAX_INSTRUCTIONS}
            </span>
          </div>
          <textarea
            id="profile-instructions"
            rows={6}
            value={instructions}
            maxLength={AGENT_PROFILE_MAX_INSTRUCTIONS}
            placeholder="You are the tech lead. Own the build and the release checklist."
            onChange={(event) => setInstructions(event.target.value)}
          />
          <p className="hint">Sent to the harness as a system message on every run.</p>
        </div>

        <div className="profile-footer">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {saved ? (
            <p className="profile-status" role="status" data-testid="profile-saved">
              Profile saved
            </p>
          ) : null}
        </div>
      </form>
      {error !== null ? (
        <p className="notice error" role="alert" data-testid="profile-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
