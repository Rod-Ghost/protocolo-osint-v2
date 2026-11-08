"""Safe, offline JPEG/PNG/WebP inspection with optional bounded OCR."""
from __future__ import annotations
import hashlib
import io
import os
from PIL import Image,ImageOps,UnidentifiedImageError

ALLOWED={'PNG','JPEG','WEBP'}
MAX_BYTES=10*1024*1024
MAX_PIXELS=24_000_000
Image.MAX_IMAGE_PIXELS=MAX_PIXELS

class InvalidImage(ValueError):pass

def analyze(raw:bytes):
    if not raw or len(raw)>MAX_BYTES: raise InvalidImage('Imagem vazia ou superior ao limite de 10 MB.')
    try:
        with Image.open(io.BytesIO(raw)) as im:
            if im.format not in ALLOWED:raise InvalidImage('Formato não suportado. Use PNG, JPG ou WebP.')
            if im.width*im.height>MAX_PIXELS:raise InvalidImage('Imagem excede o limite de 24 megapixels.')
            original_format=im.format
            exif=im.getexif()
            metadata={
                'camera_make':str(exif.get(271,'')).strip()[:140],
                'camera_model':str(exif.get(272,'')).strip()[:140],
                'captured_at':str(exif.get(306,'')).strip()[:80],
                'gps_present':34853 in exif,
            }
            rgb=ImageOps.exif_transpose(im).convert('RGB')
            tiny=rgb.resize((9,8),Image.Resampling.LANCZOS).convert('L')
            vals=list(tiny.get_flattened_data()) if hasattr(tiny, "get_flattened_data") else list(tiny.getdata())
            bits=0
            for row in range(8):
                for col in range(8):
                    bits=(bits<<1)|int(vals[row*9+col]>vals[row*9+col+1])
            dhash=f'{bits:016x}'
            width,height=rgb.size
            # Avoid sending EXIF coordinates or photos to any remote service.
            ocr={'status':'unavailable','text':''}
            if os.getenv('OSINT_OCR_ENABLED','1')=='1':
                try:
                    import pytesseract
                    from pytesseract import TesseractError
                    reduced=rgb.copy()
                    reduced.thumbnail((1800,1800))
                    rawtext=pytesseract.image_to_string(reduced,lang='eng',timeout=6)
                    ocr={'status':'completed','text':rawtext.strip()[:3000]}
                except Exception:
                    ocr={'status':'unavailable','text':''}
            return {'format':original_format,'width':width,'height':height,'bytes':len(raw),
                    'sha256':hashlib.sha256(raw).hexdigest(),'dhash':dhash,
                    'metadata':metadata,'ocr':ocr,'external_requests':0}
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError) as exc:
        raise InvalidImage('Arquivo inválido ou imagem não suportada.') from exc
