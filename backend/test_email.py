import asyncio
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def test_email():
    """Test email sending"""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
        
        print(f"SMTP Config:")
        print(f"  Host: {smtp_host}")
        print(f"  Port: {smtp_port}")
        print(f"  User: {smtp_user}")
        print(f"  From: {smtp_from}")
        print(f"  Password: {'*' * len(smtp_password) if smtp_password else 'None'}")
        
        subject = "Teste de Email - Sistema HWI"
        
        html_body = """
        <html>
            <body style="font-family: Arial, sans-serif;">
                <h2>Email de Teste</h2>
                <p>Este é um email de teste do sistema de gestão de ponto HWI.</p>
                <p>Se você recebeu este email, o sistema está funcionando corretamente!</p>
            </body>
        </html>
        """
        
        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = smtp_from
        message['To'] = smtp_from  # Send to self for testing
        
        html_part = MIMEText(html_body, 'html')
        message.attach(html_part)
        
        print("\nTentando enviar email...")
        
        await aiosmtplib.send(
            message,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True
        )
        
        print("✅ Email enviado com sucesso!")
        
    except Exception as e:
        print(f"❌ Erro ao enviar email: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_email())
