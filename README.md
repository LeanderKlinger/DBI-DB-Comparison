# DBI Comparison Rel DB vs Mongo

To install dependencies:
## Installation
```bash
bun install
```

## Dependencies
```bash
docker run -d -e POSTGRES_DB=mydb -e POSTGRES_PASSWORD=testpass123 -e POSTGRES_USER=postgres -p "6500:5432" postgres:17.0
docker run --name mongodb -p 27017:27017 -d mongodb/mongodb-community-server:latest
```


## Execution:
### Test
```bash
bun run src/test-runner.ts
```
### View persisted results
Test results can be found in the top level test-results.json;

To see the frontend execute:
```bash
bunx prisma studio
```

## Tasks solved
### Compulsary part 1
Screenshot of database model
!["Database model"](assets/model.png)

Screenshot of frontend
!["Screenshot"](assets/frontend.png)
