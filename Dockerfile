FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# The production image builds the browser bundle only. Disabling dependency
# lifecycle scripts avoids downloading the unused onnxruntime-node binary.
RUN npm ci --ignore-scripts

COPY . .

ARG VITE_MODEL_RESOURCE_BASE_URL=""
ENV VITE_MODEL_RESOURCE_BASE_URL=${VITE_MODEL_RESOURCE_BASE_URL}

RUN npm run build

FROM nginx:stable-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
