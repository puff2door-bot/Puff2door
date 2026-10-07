FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile
COPY frontend/ ./

ARG REACT_APP_SITE_URL=https://puff2door.com
ARG REACT_APP_BACKEND_URL=
ARG REACT_APP_GA4_MEASUREMENT_ID=G-9QTQEC7EPH
ENV REACT_APP_SITE_URL=$REACT_APP_SITE_URL \
    REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL \
    REACT_APP_GA4_MEASUREMENT_ID=$REACT_APP_GA4_MEASUREMENT_ID
RUN yarn build

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app/backend

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend-build /app/frontend/build /app/frontend/build

EXPOSE 10000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-10000}"]
