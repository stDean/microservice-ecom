# Notification Service 📧
A microservice for handling email notifications in an e-commerce system.

## Overview
This service processes email notifications asynchronously using RabbitMQ for reliable message delivery. It handles verification emails and password reset emails.

## Features

- ✅ Email verification
- ✅ Password reset emails
- ✅ Async processing with RabbitMQ
- ✅ Input validation with Zod
- ✅ Comprehensive logging
- ✅ Health check endpoint
- ✅ Docker containerization

# Development

- MailHog: Captures emails at http://localhost:8025
- RabbitMQ: Management UI at http://localhost:15672
- Hot Reload: Automatic restart on code changes

## Deployment
The service is containerized and can be deployed to any Docker-supported environment. Production uses external RabbitMQ and real SMTP services.

## Health & Monitoring

- Health endpoint: /api/v1/notification/health
- Structured JSON logging
- Request ID tracking
- Error tracking and alerting