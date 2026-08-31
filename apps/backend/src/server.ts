import { app } from './app.js';
import { env } from './config/env.js';

app.listen(env.PORT, () => {
  console.log(`?? Backend running at http://localhost:${env.PORT}`);
  console.log(`   Catalog:      http://localhost:${env.PORT}/catalog/products`);
  console.log(`   Schema doc:   http://localhost:${env.PORT}/catalog/schema`);
  console.log(`   Health check: http://localhost:${env.PORT}/health`);
});