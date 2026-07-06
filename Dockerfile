FROM nginx:alpine

# Copiar a página de vendas principal
COPY index.html /usr/share/nginx/html/index.html

# Copiar a área de membros completa em /login
COPY areademembros/ /usr/share/nginx/html/login/

# Copiar assets (imagens, etc) se existirem
COPY assets/ /usr/share/nginx/html/assets/

# Config nginx para servir /login corretamente
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
