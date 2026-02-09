#!/usr/bin/env python3
"""
Standalone Firestore product fetcher.

Runs as a subprocess to bypass gRPC + Gunicorn fork deadlocks.
Outputs all products as a JSON array to stdout.
Each product includes an '_id' field with the document ID.

Usage:
    python firestore_fetch_products.py [--limit N]
"""
import json
import os
import sys
import time


def main():
    import firebase_admin
    from firebase_admin import credentials, firestore

    start = time.time()

    # Initialize Firebase from environment variables
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
    private_key = os.getenv("FIREBASE_PRIVATE_KEY")

    if project_id and client_email and private_key:
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": project_id,
            "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID", ""),
            "private_key": private_key.replace("\\n", "\n"),
            "client_email": client_email,
            "client_id": os.getenv("FIREBASE_CLIENT_ID", ""),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": (
                f"https://www.googleapis.com/robot/v1/metadata/x509/{client_email}"
            ),
        })
        firebase_admin.initialize_app(cred)
    else:
        # Fallback to ADC (Application Default Credentials)
        firebase_admin.initialize_app()

    db = firestore.client()

    # Parse optional --limit argument
    limit = None
    if "--limit" in sys.argv:
        idx = sys.argv.index("--limit")
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])

    products = []
    query = db.collection("products")

    for doc in query.stream():
        data = doc.to_dict()
        data["_id"] = doc.id
        products.append(data)
        if limit and len(products) >= limit:
            break

    elapsed = time.time() - start

    # Write metadata to stderr, data to stdout
    print(
        json.dumps({"count": len(products), "elapsed_s": round(elapsed, 2)}),
        file=sys.stderr,
    )
    json.dump(products, sys.stdout, default=str)


if __name__ == "__main__":
    main()
