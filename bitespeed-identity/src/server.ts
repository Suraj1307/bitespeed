import 'dotenv/config';
import app from './app';
import prisma from './utils/prismaClient';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function bootstrap(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('? Database connected');

    const server = app.listen(PORT, () => {
      console.log(`?? Server running on http://localhost:${PORT}`);
      console.log(`   Environment : ${process.env.NODE_ENV ?? 'development'}`);
      console.log(`   Health check: http://localhost:${PORT}/health`);
    });

    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\n? ${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await prisma.$disconnect();
        console.log('?? Database disconnected');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('? Failed to start server:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();
