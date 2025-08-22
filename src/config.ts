export const CONFIG = {
  port: Number(process.env.PORT ?? 8080),
  dbUrl: process.env.DATABASE_URL!,
  cors: (process.env.CORS_ALLOWED_ORIGINS ?? '*').split(','),
  rawKeys: {
    writer: process.env.WRITER_API_KEY!,
    admin: process.env.ADMIN_API_KEY!,
    sa: process.env.SA_API_KEY!
  }
};

