import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const app = await NestFactory.create(AppModule, {
    cors: { origin: corsOrigins, credentials: true },
    // ปิด body-parser default ของ Nest เพื่อให้ limit ด้านล่างมีผลจริง (ไม่งั้น req._body ถูกตั้งไปแล้วก่อนถึง app.use)
    bodyParser: false,
  });

  app.use(helmet());
  // จำกัดขนาด request body กัน payload ใหญ่เกินจำเป็น (DoS ผ่าน large body)
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.setGlobalPrefix('api/v1');
  // ทำให้ @Exclude() บน entity (เช่น passwordHash, refreshTokenHash) มีผลจริงกับทุก response
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('IT Asset Lifecycle Management API')
    .setDescription('ระบบทรัพย์สิน IT — ซื้อ -> รับของ -> เบิก/ยืม -> ส่งมอบ/คืน -> ซ่อม -> ประกัน -> จำหน่ายทิ้ง')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚀 Server running on http://localhost:${port}/api/v1`);
  // eslint-disable-next-line no-console
  console.log(`📘 Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
