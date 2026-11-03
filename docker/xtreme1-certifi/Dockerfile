ARG BASE_IMAGE
FROM ${BASE_IMAGE}

COPY requirements.txt verify_certifi.py /opt/security-certifi/
RUN python3 -m pip install --no-cache-dir --no-deps --only-binary=:all: --require-hashes --index-url https://pypi.org/simple -r /opt/security-certifi/requirements.txt \
    && python3 /opt/security-certifi/verify_certifi.py
