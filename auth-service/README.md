# 🔐 Auth Service
A secure, production-ready authentication microservice built with Node.js, Express, and TypeScript.

# 🚀 Features

- User Registration with email verification
- JWT-based Authentication with access & refresh tokens
- Session Management with secure HTTP-only cookies
- Password Reset workflow with secure tokens
- Email Verification with token expiration
- Role-based Access Control (ready for extension)
- Security Best Practices (bcrypt, CSRF protection, rate limiting ready)

# 🛠️ Tech Stack

- Runtime: Node.js + Express + TypeScript
- Database: PostgreSQL with Drizzle ORM
- Security: bcrypt, JWT, HTTP-only cookies
- Validation: Custom middleware + error handling
- Logging: Structured logging with Winston

# 🔒 Security Features

- ✅ Password hashing with bcrypt
- ✅ JWT tokens with expiration
- ✅ HTTP-only cookies for refresh tokens
- ✅ CSRF protection with SameSite cookies
- ✅ Email verification required for login
- ✅ Secure password reset flow
- ✅ Session invalidation on password change
- ✅ Input validation & error handling
- ✅ No email enumeration in responses

# 🗄️ Database Schema

- users - User accounts with email verification
- sessions - Active user sessions with refresh tokens
- verification_tokens - Email verification tokens
- password_reset_tokens - Password reset tokens

# 🚨 Production Notes

- Set NODE_ENV=production for secure cookies
- Configure COOKIE_DOMAIN for cross-subdomain auth
- Use API gateway for rate limiting
- Implement email service for verification emails
- Set up proper logging and monitoring
- Use HTTPS in production

# TODO
- Add Radis Pub/Sub functionality to link up with the notification service