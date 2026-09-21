const transporter = require("../config/mailer");
const { appendRow, SHEET_NAME2 } = require("../config/googlesheets");

const requestCallback = async (req, res) => {
  try {
    const { fullName, email, phone, timeSlot, message } = req.body;

    if (!fullName || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: "Full name, email and phone are required.",
      });
    }

    // ===== 1) Notification email -> ADMIN =====
    // Admin can hit "Reply" and it goes straight to the customer's email
    const adminMail = transporter.sendMail({
      from: `"Callback Request" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      replyTo: email,
      subject: `🔔 New Callback Request from ${fullName}`,
      html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>

<body style="margin:0;padding:0;background:#0a0c0e;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0c0e;padding:40px 15px;">
<tr>
<td align="center">

<table width="650" cellpadding="0" cellspacing="0"
style="max-width:650px;background:#10151a;border:1px solid #1c2a2c;border-radius:18px;overflow:hidden;">

<!-- Header -->
<tr>
<td style="padding:35px;text-align:center;
background:linear-gradient(135deg,#0a0c0e,#0e2320);">

<h1 style="margin:0;color:#3fe6cf;font-size:28px;">
Faces On Faces
</h1>

<p style="margin-top:12px;color:#b8dcd4;font-size:15px;">
New "Request A Callback" Request
</p>

</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:35px;">

<p style="font-size:16px;color:#ffffff;margin-top:0;">
A new callback request has been submitted through the website.
</p>

<table width="100%" cellpadding="12" cellspacing="0"
style="border-collapse:collapse;border:1px solid #1d3e3a;border-radius:12px;overflow:hidden;">

<tr style="background:#151b1e;">
<td width="170" style="color:#3fe6cf;"><strong>Full Name</strong></td>
<td>${fullName}</td>
</tr>

<tr>
<td style="color:#3fe6cf;"><strong>Email</strong></td>
<td>${email}</td>
</tr>

<tr style="background:#151b1e;">
<td style="color:#3fe6cf;"><strong>Phone</strong></td>
<td>${phone}</td>
</tr>

<tr>
<td style="color:#3fe6cf;"><strong>Best Time To Call</strong></td>
<td>${timeSlot || "Not specified"}</td>
</tr>

</table>

<div style="
margin-top:28px;
background:#151b1e;
border-left:4px solid #3fe6cf;
padding:20px;
border-radius:10px;">

<h3 style="margin-top:0;color:#3fe6cf;">
Message
</h3>

<p style="margin:0;color:#d8e4e0;line-height:1.8;">
${(message || "None").replace(/\n/g, "<br>")}
</p>

</div>

</td>
</tr>

<!-- Footer -->

<tr>
<td align="center"
style="padding:24px;background:#08100e;color:#91b2a9;font-size:13px;">

This notification was automatically generated from the
<strong>Faces On Faces</strong> website.

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`,
    });

    // ===== 2) Confirmation email -> USER =====
    // If the user hits "Reply" on this email, it goes automatically to EMAIL_USER (admin inbox)
    const userMail = transporter.sendMail({
      from: `"Faces On Faces" <${process.env.EMAIL_USER}>`,
      to: email,
      replyTo: process.env.EMAIL_USER,
      subject: `We've received your callback request, ${fullName}!`,
      html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>

<body style="margin:0;padding:0;background:#0a0c0e;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0"
style="background:#0a0c0e;padding:40px 15px;">

<tr>
<td align="center">

<table width="650" cellpadding="0" cellspacing="0"
style="
max-width:650px;
background:#10151a;
border:1px solid #1c2a2c;
border-radius:18px;
overflow:hidden;
">

<!-- Hero -->

<tr>
<td align="center"
style="
padding:45px 35px;
background:linear-gradient(135deg,#0a0c0e,#0e2320);
">

<h1 style="
margin:0;
font-size:32px;
color:#3fe6cf;
">
Faces On Faces
</h1>

<p style="
margin-top:18px;
font-size:18px;
color:#ffffff;
">
Thanks for reaching out!
</p>

<p style="
margin-top:10px;
font-size:15px;
color:#afcfc7;
line-height:1.7;
max-width:470px;
">
Your callback request has been successfully received.
A member of our team will call you during your chosen time slot.
</p>

</td>
</tr>

<!-- Body -->

<tr>
<td style="padding:35px;">

<h2 style="
margin-top:0;
color:#3fe6cf;
">
Hi ${fullName},
</h2>

<p style="
color:#d6e3df;
line-height:1.8;
font-size:15px;
">

Thank you for reaching out to
<strong>Faces On Faces.</strong>

We've safely received your request.

Below is a copy of your submitted information.

</p>

<table width="100%" cellpadding="12"
style="
margin-top:25px;
border-collapse:collapse;
border:1px solid #1c2a2c;
border-radius:10px;
overflow:hidden;
">

<tr style="background:#151b1e;">
<td width="180" style="color:#3fe6cf;"><strong>Phone</strong></td>
<td style="color:#ffffff;">${phone}</td>
</tr>

<tr>
<td style="color:#3fe6cf;"><strong>Best Time To Call</strong></td>
<td style="color:#ffffff;">${timeSlot || "Not specified"}</td>
</tr>

</table>

<div style="
margin-top:28px;
background:#151b1e;
padding:20px;
border-left:4px solid #3fe6cf;
border-radius:10px;
">

<h3 style="margin-top:0;color:#3fe6cf;">
Your Message
</h3>

<p style="
margin:0;
color:#d7e5df;
line-height:1.8;
">
${(message || "None").replace(/\n/g, "<br>")}
</p>

</div>

<div style="
margin-top:35px;
padding:25px;
border-radius:12px;
background:linear-gradient(135deg,#08211c,#102f28);
text-align:center;
">

<h3 style="
margin-top:0;
color:#3fe6cf;
">
What Happens Next?
</h3>

<p style="
margin-bottom:0;
color:#d5e3df;
line-height:1.8;
">
Our team will call you during your chosen time slot.
If you'd like to add more information, simply reply to this email — we'll receive it directly.
</p>

</div>

<div style="text-align:center;margin-top:35px;">

<a href="https://facesonfaces.com"
style="
display:inline-block;
padding:15px 34px;
background:#3fe6cf;
color:#0a0c0e;
font-weight:bold;
text-decoration:none;
border-radius:10px;
font-size:15px;
">
Visit Our Website
</a>

</div>

</td>
</tr>

<!-- Footer -->

<tr>
<td
style="
padding:28px;
text-align:center;
background:#08100e;
font-size:13px;
color:#9fb3ad;
">

<strong style="color:#3fe6cf;">
Faces On Faces
</strong>

<br><br>

Thank you for choosing us.

<br><br>

© ${new Date().getFullYear()} Faces On Faces. All rights reserved.

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`,
    });

    // ===== 3) Add row -> GOOGLE SHEET (RequestCallBack tab, via GOOGLE_SHEET_NAME2) =====
    const timestamp = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
    const sheetAppend = appendRow(
      [
        fullName,
        email,
        `'${phone}`, // ← leading apostrophe forces Google Sheets to store this as TEXT,
                     //   otherwise a value starting with "+" is parsed as a formula (#ERROR!)
        message || "",
        timeSlot || "Not specified",
        timestamp,
        "Pending",
      ],
      SHEET_NAME2
    );

    // Run email + sheet writes together. Use allSettled so that if the
    // sheet write fails, the emails still go through (and the reverse) —
    // one failure doesn't block the other two.
    const results = await Promise.allSettled([adminMail, userMail, sheetAppend]);

    results.forEach((result, i) => {
      if (result.status === "rejected") {
        const labels = ["Admin email", "User email", "Google Sheet append"];
        console.error(`❌ ${labels[i]} failed:`, result.reason?.message || result.reason);
      }
    });

    return res.status(200).json({
      success: true,
      message: "Your callback request has been sent successfully.",
    });
  } catch (error) {
    console.error("❌ Callback request error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to submit the form. Please try again later.",
    });
  }
};

module.exports = { requestCallback };