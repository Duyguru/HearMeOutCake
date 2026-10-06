import logging
from typing import Optional
from supabase import create_client, Client
from api.config import settings

logger = logging.getLogger("hearmeoutcake.supabase")
_client: Optional[Client] = None


def get_supabase_client() -> Optional[Client]:
    """
    Supabase client singleton'ı döner.
    Eğer SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY tanımlı değilse None döner.
    """
    global _client
    if not settings.is_supabase_configured:
        return None

    if _client is None:
        try:
            _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
            logger.info("Supabase client başarıyla başlatıldı.")
        except Exception as e:
            logger.error(f"Supabase client başlatılamadı: {e}")
            return None

    return _client
