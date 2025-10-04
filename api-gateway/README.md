# Enterprise TypeScript API Gateway
A production-ready API Gateway built with TypeScript and Express that provides secure routing, monitoring, and orchestration for microservices architecture.

# 🚀 Features
- 🔒 Security - JWT authentication, Helmet, CORS, Rate Limiting

- 📊 Monitoring - Structured logging, health checks, distributed tracing

- ⚡ Performance - Compression, caching, timeout management

- 🛡️ Reliability - Circuit breaking, error handling, graceful shutdown

- 🔧 Development - TypeScript, hot reloading, environment config

# 🏗️ Architecture
```text
  Client App → API Gateway → Microservices (Auth, Users, Products, etc.)
```

# 🐳 Docker
## Development
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Production
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up
```

# 🛠️ Built With
- TypeScript & Express

- JWT for authentication

- Circuit breaker pattern

- HTTP Proxy Middleware

- Helmet, CORS, Rate Limiting

- Structured logging with correlation IDs