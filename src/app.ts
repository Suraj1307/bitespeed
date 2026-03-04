import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import identifyRouter from './routes/identify';
import healthRouter from './routes/health';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.use('/health', healthRouter);
app.use('/identify', identifyRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
