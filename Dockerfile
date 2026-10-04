FROM node:22-alpine AS build
WORKDIR /app
COPY . .
# The static builder uses Node's standard library and checked-in vendor assets.
RUN OPENBEXI_DATA_STATUS_URL=/api/data-update-status node scripts/build-static.mjs

FROM nginx:stable-alpine
ENV PORT=8080
ENV OPENBEXI_CANDIDATE_RETENTION=1
ENV OPENBEXI_READ_ONLY_HOST=1
RUN apk add --no-cache python3 py3-pip ca-certificates \
    && python3 -m venv /opt/python \
    && /opt/python/bin/pip install --no-cache-dir google-cloud-storage==3.16.0
ENV PATH="/opt/python/bin:${PATH}"
RUN rm -rf /usr/share/nginx/html/*
COPY deploy/cloud-run/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/ /usr/share/nginx/html/
WORKDIR /app
COPY server.py /app/server.py
COPY services /app/services
COPY tools /app/tools
COPY release/version.json /app/release/version.json
COPY --from=build /app/dist/json/ /app/json/
COPY json/satcat.csv json/satcat.meta.json /app/json/
COPY deploy/cloud-run/start.sh /app/start.sh
CMD ["/bin/sh", "/app/start.sh"]
EXPOSE 8080
