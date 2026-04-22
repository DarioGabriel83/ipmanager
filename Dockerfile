# Use official Node.js lightweight image
FROM node:lts-slim

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application files
COPY . .

# Ensure the database text files exist and have correct permissions
# (This step prevents permission issues if the container tries to create them)
RUN mkdir -p db && touch db/users.txt db/ips.txt && chmod 666 db/users.txt db/ips.txt

# Expose the API port
EXPOSE 3210

# Start the application
CMD ["npm", "start"]
