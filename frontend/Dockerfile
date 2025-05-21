FROM node:18-alpine

# Copy and install dependencies
WORKDIR /app
COPY package*.json ./
# and the app
RUN npm install
COPY . .
RUN npm run build
# Install 'serve' for hosting
RUN npm install -g serve
# Serve the React build folder on port 3000
CMD ["serve", "-s", "build", "-l", "3000"]