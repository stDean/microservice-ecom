import * as nodemailer from "nodemailer";
import { MailOptions } from "nodemailer/lib/sendmail-transport";

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT) || 587,
  secure: process.env.MAIL_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

export const sendMail = (mailOptions: MailOptions) => {
  return new Promise((res, rej) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return rej(error);
      }

      console.log("Email sent:", info.response);
      res(info);
    });
  });
};
