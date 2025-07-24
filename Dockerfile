# Define custom function directory
ARG FUNCTION_DIR="/function"

# ----------------- Build Stage -----------------
# Install Node.js and build dependencies
FROM node:20-bullseye as build-image

# Include ARG global in this stage
ARG FUNCTION_DIR

# Create function directory
RUN mkdir -p ${FUNCTION_DIR}
WORKDIR ${FUNCTION_DIR}

# Install build dependencies
RUN apt-get update && \
    apt-get install -y \
    g++ \
    make \
    cmake \
    unzip \
    libcurl4-openssl-dev

COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including dev dependencies for TypeScript compilation)
RUN npm install

# Install the runtime interface client
RUN npm install aws-lambda-ric

# Copy the TypeScript source code
COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build

# ----------------- Production Stage -----------------
# Use the official Playwright image that already contains the browsers
FROM mcr.microsoft.com/playwright:v1.54.1-jammy as production-image

# ARG must be redeclared in each stage
ARG FUNCTION_DIR="/function"

ENV PLAYWRIGHT_BROWSERS_PATH="/ms-playwright"

# Create and set the working directory
WORKDIR ${FUNCTION_DIR}

# Copy only the compiled JavaScript files and production dependencies
COPY --from=build-image ${FUNCTION_DIR}/dist ${FUNCTION_DIR}/dist
COPY --from=build-image ${FUNCTION_DIR}/node_modules ${FUNCTION_DIR}/node_modules
COPY --from=build-image ${FUNCTION_DIR}/package*.json ${FUNCTION_DIR}/

# Entry point for the AWS Lambda execution environment client
ENTRYPOINT ["/usr/bin/npx", "aws-lambda-ric"]

# Command to run the Lambda function handler (now pointing to compiled JS)
CMD ["dist/index.handler"]
