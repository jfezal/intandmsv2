import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { loadEnv } from './config/env.schema';

// Prisma returns BigInt for size columns; JSON has no BigInt type.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function toJSON(this: bigint) {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const env = loadEnv(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: env.TRUST_PROXY }),
  );

  await app.register(fastifyCookie as unknown as Parameters<NestFastifyApplication['register']>[0], {
    secret: env.SESSION_SIGNING_SECRET,
  });
  await app.register(fastifyMultipart as unknown as Parameters<NestFastifyApplication['register']>[0], {
    limits: { fileSize: 100 * 1024 * 1024 },
  });

  app.useGlobalFilters(new ProblemDetailsFilter());
  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('IntanDMS V2 API')
    .setDescription('On-premise document management — foundation phase')
    .setVersion('0.1.0')
    .addCookieAuth(env.SESSION_COOKIE_NAME)
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
