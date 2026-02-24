import argparse
import html
import json
import os
import re
import urllib.request
import zipfile
from pathlib import Path


def docx_to_text(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
    xml = re.sub(r"</w:p>", "\n", xml)
    xml = re.sub(r"<[^>]+>", "", xml)
    text = html.unescape(xml)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def upload_document(api_base: str, admin_token: str, title: str, source: str, text: str) -> None:
    url = f"{api_base.rstrip('/')}/api/admin/knowledge/upload"
    payload = json.dumps(
        {
            "title": title,
            "source": source,
            "text": text,
            "version": "v1",
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {admin_token}",
        },
    )
    with urllib.request.urlopen(request) as response:
        body = response.read().decode("utf-8")
        print(f"Uploaded {title}: {response.status} {body}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest DOCX files into Rocha Turbo knowledge base.")
    parser.add_argument(
        "--folder",
        default=r"C:\Users\pcram\OneDrive\Documentos\Clientes\Turbo Rocha\Base de Dados",
        help="Folder with DOCX files to ingest.",
    )
    parser.add_argument("--api-base", default=os.environ.get("APP_BASE_URL", "http://localhost:3000"))
    parser.add_argument("--admin-token", default=os.environ.get("ADMIN_API_TOKEN", ""))
    args = parser.parse_args()

    if not args.admin_token:
        raise SystemExit("ADMIN_API_TOKEN is required (argument or environment variable).")

    folder = Path(args.folder)
    if not folder.exists():
        raise SystemExit(f"Folder not found: {folder}")

    files = [file for file in folder.glob("*.docx") if not file.name.startswith("~$")]
    if not files:
        print("No DOCX files found.")
        return

    for file in files:
        text = docx_to_text(file)
        if len(text) < 20:
            print(f"Skipping {file.name}: not enough text extracted.")
            continue
        upload_document(
            api_base=args.api_base,
            admin_token=args.admin_token,
            title=file.stem,
            source=str(file),
            text=text,
        )


if __name__ == "__main__":
    main()
