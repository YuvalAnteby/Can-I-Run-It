FROM node:18-alpine

# Copy and install dependencies
WORKDIR /app
COPY package*.json ./
# and the app
RUN npm install
COPY . .
# for developement time
CMD ["npm", "start"]