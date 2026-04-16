const nodemailer = require('nodemailer');

const createTransporter = () => {
  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || '').trim();

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
};

const sendPasswordOtpEmail = async ({ to, username, otp }) => {
  const transporter = createTransporter();

  if (!transporter) {
    return { sent: false, reason: 'EMAIL_USER or EMAIL_PASS is missing' };
  }

  const from = String(process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim();

  await transporter.sendMail({
    from,
    to,
    subject: 'DataVerse password reset OTP',
    text: `Hello ${username || 'user'},\n\nYour DataVerse password reset OTP is: ${otp}\n\nThis OTP expires in 5 minutes. If you did not request it, please ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2 style="margin:0 0 12px">DataVerse password reset</h2>
        <p>Hello ${username || 'user'},</p>
        <p>Your one-time password (OTP) is:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:4px;padding:16px 20px;background:#eef2ff;border-radius:12px;display:inline-block">${otp}</div>
        <p style="margin-top:16px">This OTP expires in 5 minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `
  });

  return { sent: true };
};

module.exports = {
  sendPasswordOtpEmail,
  // Backward compatible export in case any existing code still imports the old name.
  sendResetCodeEmail: sendPasswordOtpEmail
};
