to run e-commerce app

docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

#### 2. Production Mode

This uses the base file and the production overrides (ensure you define your secrets in a $\texttt{.env}$ file or environment variables):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d