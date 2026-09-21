// services/emailService.js
const transporter = require("../config/mailer");

const wrap = (title, bodyHtml) => `
  <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;background:#fff;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
    <div style="background:#111111;padding:24px 28px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:1px;">Faces On Faces Academy</h1>
      <p style="margin:6px 0 0;color:#d4d4d4;font-size:13px;">${title}</p>
    </div>
    <div style="padding:30px 28px;">${bodyHtml}</div>
    <div style="background:#f8f8f8;padding:16px 28px;text-align:center;border-top:1px solid #eeeeee;">
      <p style="margin:0;color:#888888;font-size:11px;">This is an automated notification from Faces On Faces Academy.</p>
    </div>
  </div>
`;

const row = (label, value) =>
  `<p style="margin:0 0 10px;"><strong>${label}:</strong> <span style="color:#555555;">${value}</span></p>`;

async function sendEnrollmentConfirmationEmails({ type, name, email, phone, courseName, amount, remainingBalance }) {
  const isDeposit = type === "deposit";

  const adminHtml = wrap(
    isDeposit ? "New Deposit Enrollment" : "New Course Enrollment",
    `
      ${row("Name", name)}
      ${row("Email", email)}
      ${row("Phone", phone)}
      ${row("Course", courseName)}
      ${row("Amount Paid", `£${amount}`)}
      ${isDeposit ? row("Remaining Balance", `£${remainingBalance}`) : ""}
    `
  );

  const studentHtml = wrap(
    "Enrollment Confirmed",
    `
      <h2 style="margin:0 0 12px;color:#111111;">Congratulations ${name}! 🎉</h2>
      <p style="color:#555555;line-height:1.7;">Thank you for enrolling with Faces On Faces Academy on the <strong>${courseName}</strong>.</p>
      ${row("Amount Paid", `£${amount}`)}
      ${isDeposit ? row("Remaining Balance", `£${remainingBalance}`) : ""}
      <p style="color:#555555;line-height:1.7;">Our admissions team will be in touch shortly with your course schedule and next steps.</p>
    `
  );

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: `New ${isDeposit ? "Deposit " : ""}Enrollment - Faces On Faces`,
    html: adminHtml,
  });

  await transporter.sendMail({
    from: `"Faces On Faces Academy" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "🎉 Enrollment Confirmed – Faces On Faces Academy",
    html: studentHtml,
  });
}

async function sendSubscriptionActiveEmails({
  name,
  email,
  phone,
  courseName,
  firstPaymentAmount,
  monthlyAmount,
  installments,
  mandateId,
  subscriptionId,
}) {
  const adminHtml = wrap(
    "New Subscription Activated",
    `
      ${row("Name", name)}
      ${row("Email", email)}
      ${row("Phone", phone)}
      ${row("Course", courseName)}
      ${row("First Payment (Stripe)", `£${firstPaymentAmount}`)}
      ${row("Monthly Amount", `£${monthlyAmount}`)}
      ${row("Number of Payments", installments)}
      ${row("Mandate ID", mandateId)}
      ${row("Subscription ID", subscriptionId)}
    `
  );

  const studentHtml = wrap(
    "Direct Debit Confirmed",
    `
      <h2 style="margin:0 0 12px;color:#111111;">You're all set, ${name}! 🎉</h2>
      <p style="color:#555555;line-height:1.7;">Your first payment has been received and your Direct Debit for the <strong>${courseName}</strong> is now active.</p>
      ${row("First Payment (paid)", `£${firstPaymentAmount}`)}
      ${row("Monthly Payment", `£${monthlyAmount}`)}
      ${row("Number of Monthly Payments", installments)}
      <p style="color:#555555;line-height:1.7;">Monthly payments are collected automatically by GoCardless. We'll be in touch with your course schedule shortly.</p>
    `
  );

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: "New Subscription Activated - Faces On Faces",
    html: adminHtml,
  });

  await transporter.sendMail({
    from: `"Faces On Faces Academy" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "🎉 Direct Debit Confirmed – Faces On Faces Academy",
    html: studentHtml,
  });
}

module.exports = { sendEnrollmentConfirmationEmails, sendSubscriptionActiveEmails };