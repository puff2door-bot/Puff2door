"""Process-wide log safety settings loaded automatically by Python."""

import logging


# httpx logs complete request URLs at INFO. OAuth exchanges and Graph API calls
# can include credentials in query strings, so never emit those URLs.
for _logger_name in ("httpx", "httpcore"):
    _http_logger = logging.getLogger(_logger_name)
    _http_logger.setLevel(logging.WARNING)
    _http_logger.disabled = True
