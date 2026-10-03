FROM node:22-alpine AS build
WORKDIR /app
COPY . .
# The static builder uses Node's standard library and checked-in vendor assets.
RUN node scripts/build-static.mjs

FROM nginx:stable-alpine
ENV PORT=8080
RUN rm -rf /usr/share/nginx/html/*
COPY deploy/cloud-run/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 8080
