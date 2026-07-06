FROM nginx:alpine

# Copiar apenas o index.html (as imagens agora são servidas via links CDN)
COPY index.html /usr/share/nginx/html/

# Expor a porta 80 do container
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
