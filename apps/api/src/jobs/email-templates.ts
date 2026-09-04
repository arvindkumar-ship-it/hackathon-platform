type TemplateResult = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderTemplate(
  templateKey: string,
  data: Record<string, unknown>,
): TemplateResult {
  if (templateKey === 'TEAM_INVITATION') {
    const inviterName = escapeHtml(String(data.inviterName ?? 'A teammate'));
    const eventName = escapeHtml(String(data.eventName ?? 'the event'));
    const inviteUrl = String(data.inviteUrl ?? '');

    return {
      subject: `Invitation to join ${eventName}`,
      html: `
        <main>
          <h1>Team invitation</h1>
          <p>${inviterName} invited you to join ${eventName}.</p>
          <p>
            <a href="${escapeHtml(inviteUrl)}">
              View invitation
            </a>
          </p>
        </main>
      `,
      text: [
        'Team invitation',
        `${inviterName} invited you to join ${eventName}.`,
        `View invitation: ${inviteUrl}`,
      ].join('\n'),
    };
  }

  if (templateKey === 'SUBMISSION_RECEIVED') {
    const eventName = escapeHtml(String(data.eventName ?? 'the event'));
    const submissionTitle = escapeHtml(
      String(data.submissionTitle ?? 'your submission'),
    );

    return {
      subject: `Submission received: ${eventName}`,
      html: `
        <main>
          <h1>Submission received</h1>
          <p>Your submission <strong>${submissionTitle}</strong> was received for ${eventName}.</p>
        </main>
      `,
      text: [
        'Submission received',
        `Your submission "${submissionTitle}" was received for ${eventName}.`,
      ].join('\n'),
    };
  }

  if (templateKey === 'JUDGE_ASSIGNMENT') {
    const eventName = escapeHtml(String(data.eventName ?? 'the event'));
    const judgeUrl = String(data.judgeUrl ?? '');

    return {
      subject: `New judging assignment: ${eventName}`,
      html: `
        <main>
          <h1>New judging assignment</h1>
          <p>You have received a new assignment for ${eventName}.</p>
          <p>
            <a href="${escapeHtml(judgeUrl)}">
              Open assignment
            </a>
          </p>
        </main>
      `,
      text: [
        'New judging assignment',
        `You have received a new assignment for ${eventName}.`,
        `Open assignment: ${judgeUrl}`,
      ].join('\n'),
    };
  }
  if (templateKey === 'PASSWORD_RESET') {
    const resetUrl = String(data.resetUrl ?? '');
    const expiresInMinutes = String(data.expiresInMinutes ?? '30');

    return {
      subject: 'Reset your password',
      html: `
        <main>
          <h1>Reset your password</h1>
          <p>We received a request to reset your password. This link expires in ${escapeHtml(expiresInMinutes)} minutes.</p>
          <p>
            <a href="${escapeHtml(resetUrl)}">
              Reset password
            </a>
          </p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        </main>
      `,
      text: [
        'Reset your password',
        `This link expires in ${expiresInMinutes} minutes.`,
        `Reset password: ${resetUrl}`,
        "If you didn't request this, you can safely ignore this email.",
      ].join('\n'),
    };
  }

  if (templateKey === 'WINNER_ANNOUNCEMENT') {
    const eventName = escapeHtml(String(data.eventName ?? 'the event'));
    const resultUrl = String(data.resultUrl ?? '');

    return {
      subject: `Results announced: ${eventName}`,
      html: `
        <main>
          <h1>Results announced</h1>
          <p>The results for ${eventName} are now available.</p>
          <p>
            <a href="${escapeHtml(resultUrl)}">
              View results
            </a>
          </p>
        </main>
      `,
      text: [
        'Results announced',
        `The results for ${eventName} are now available.`,
        `View results: ${resultUrl}`,
      ].join('\n'),
    };
  }

  throw new Error(`Unknown email template: ${templateKey}`);
}