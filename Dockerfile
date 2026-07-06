FROM nginx:alpine

# Copiar os arquivos estáticos para o diretório padrão do Nginx
COPY index.html /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/

# Expor a porta 80 do container
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
