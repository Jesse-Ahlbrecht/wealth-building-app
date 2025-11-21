"""
Document Type Detector

Utilities for detecting document types from file content and filenames.
"""

import os
import tempfile
import uuid
from typing import Optional
from PyPDF2 import PdfReader


def detect_document_type_from_content(file_content: bytes, filename: str) -> Optional[str]:
    """
    Detect document type from file content structure (column names, text patterns).
    Returns the document type key or None if detection fails.
    """
    if not file_content:
        return None
    
    extension = os.path.splitext(filename)[1].lower()
    
    # For CSV files, detect based on column names
    if extension == '.csv':
        try:
            # Try different encodings
            encodings = ['utf-8-sig', 'utf-8', 'windows-1252', 'iso-8859-1', 'cp1252']
            text_content = None
            
            for encoding in encodings:
                try:
                    text_content = file_content.decode(encoding)
                    break
                except UnicodeDecodeError:
                    continue
            
            if text_content is None:
                return None
            
            # Read first few lines to find header
            lines = text_content.split('\n')[:50]
            
            # Find header row
            header_line = None
            
            for i, line in enumerate(lines):
                line_upper = line.upper()
                # YUH detection
                if 'DATE' in line_upper and ('DEBIT' in line_upper or 'CREDIT' in line_upper) and 'ACTIVITY' in line_upper:
                    header_line = line
                    break
                # DKB detection
                elif ('BUCHUNGSTAG' in line_upper or 'BUCHUNGSDATUM' in line_upper or 
                      ('BUCHUNG' in line_upper and 'BETRAG' in line_upper)):
                    header_line = line
                    break
                # ING DiBa detection
                elif 'ISIN' in line_upper and ('WERTPAPIERNAME' in line_upper or 'WERTPAPIER' in line_upper):
                    header_line = line
                    break
            
            if not header_line:
                # Fallback
                for i, line in enumerate(lines):
                    if ';' in line and len(line.split(';')) >= 3:
                        parts = line.split(';')
                        text_parts = [p for p in parts if any(c.isalpha() for c in p)]
                        if len(text_parts) >= 2:
                            header_line = line
                            break
            
            if not header_line:
                print(f"Could not find CSV header in file {filename}")
                return None
            
            # Normalize header
            header_normalized = header_line.replace('"', '').strip()
            columns = [col.strip().upper() for col in header_normalized.split(';')]
            
            print(f"Detected columns for {filename}: {columns[:5]}...")
            
            # YUH Bank Statement detection
            if 'DATE' in columns and ('DEBIT' in columns or 'CREDIT' in columns):
                if 'ACTIVITY NAME' in columns or 'ACTIVITY TYPE' in columns or 'ACTIVITY' in columns:
                    print(f"Detected as YUH bank statement")
                    return 'bank_statement_yuh'
            
            # DKB Bank Statement detection
            if ('BUCHUNGSTAG' in columns or 'BUCHUNGSDATUM' in columns or 
                ('BUCHUNG' in columns and 'BETRAG' in columns)):
                print(f"Detected as DKB bank statement")
                return 'bank_statement_dkb'
            
            # ING DiBa Broker detection
            if 'ISIN' in columns and ('WERTPAPIERNAME' in columns or 'WERTPAPIER' in columns):
                print(f"Detected as ING DiBa broker")
                return 'broker_ing_diba_csv'
            
        except Exception as e:
            print(f"Error detecting CSV document type: {e}")
            return None
    
    # For PDF files, detect based on text content
    elif extension == '.pdf':
        try:
            # Save to temp file
            temp_dir = tempfile.gettempdir()
            temp_filename = f"{uuid.uuid4()}_{filename}"
            temp_path = os.path.join(temp_dir, temp_filename)
            
            with open(temp_path, 'wb') as f:
                f.write(file_content)
            
            try:
                reader = PdfReader(temp_path)
                text = ""
                # Read first 2 pages for detection
                for page in reader.pages[:2]:
                    text += page.extract_text()
                
                text_upper = text.upper()
                
                # KfW Loan detection
                if ('KFW' in text_upper or 'KFW' in text) and 'KONTOAUSZUG PER' in text_upper and 'DARLEHENSKONTO' in text_upper:
                    return 'loan_kfw_pdf'
                
                # VIAC Broker detection
                if 'VIAC' in text_upper and 'ISIN' in text_upper and ('VALUTA' in text_upper or 'VERRECHNETER BETRAG' in text_upper):
                    return 'broker_viac_pdf'
                
            finally:
                # Clean up temp file
                try:
                    os.remove(temp_path)
                except:
                    pass
                    
        except Exception as e:
            print(f"Error detecting PDF document type: {e}")
            return None
    
    return None


def detect_document_type(filename: str) -> Optional[str]:
    """
    Legacy function: Detect document type from filename based on patterns.
    Returns the document type key or None if detection fails.
    """
    if not filename:
        return None
    
    filename_lower = filename.lower()
    extension = os.path.splitext(filename)[1].lower()
    
    # Bank statements - CSV files
    if extension == '.csv':
        if 'yuh' in filename_lower or 'aktivit' in filename_lower:
            return 'bank_statement_yuh'
        elif 'umsatzliste' in filename_lower or 'girokonto' in filename_lower or 'tagesgeld' in filename_lower or 'dkb' in filename_lower:
            return 'bank_statement_dkb'
        return 'bank_statement_dkb'
    
    # Broker reports
    if extension == '.pdf':
        if 'viac' in filename_lower:
            return 'broker_viac_pdf'
        elif 'ing' in filename_lower or 'diba' in filename_lower or 'depot' in filename_lower:
            return 'broker_ing_diba_csv'
    
    if extension == '.csv':
        if 'ing' in filename_lower or 'diba' in filename_lower or 'depot' in filename_lower:
            return 'broker_ing_diba_csv'
    
    # Loan documents
    if extension == '.pdf':
        if 'kfw' in filename_lower or 'kredit' in filename_lower:
            return 'loan_kfw_pdf'
    
    return None
