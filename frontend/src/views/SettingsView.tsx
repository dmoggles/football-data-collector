import { useState } from "react";
import type { FormEvent } from "react";
import { changePassword } from "../api";

type SettingsViewProps = {
  onLoggedOut: () => void;
};

export function SettingsView({ onLoggedOut }: SettingsViewProps) {
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPasswordInput !== confirmPasswordInput) {
      setError("New password and confirmation do not match");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await changePassword({ current_password: currentPasswordInput, new_password: newPasswordInput });
      onLoggedOut();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to change password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="section-card">
      {error ? <p className="error-message">{error}</p> : null}
      <div className="stack-form">
        <h3>Account Security</h3>
        <form className="stack-form" onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Current password"
            value={currentPasswordInput}
            onChange={(event) => setCurrentPasswordInput(event.target.value)}
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder="New password"
            value={newPasswordInput}
            onChange={(event) => setNewPasswordInput(event.target.value)}
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPasswordInput}
            onChange={(event) => setConfirmPasswordInput(event.target.value)}
            minLength={8}
            required
          />
          <button className="button secondary" type="submit" disabled={isSubmitting}>
            Change Password
          </button>
          <p className="muted">You will be logged out after password change.</p>
        </form>
      </div>
    </section>
  );
}
