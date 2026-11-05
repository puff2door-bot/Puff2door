"""Process-wide log safety settings loaded automatically by Python."""

import logging


# httpx logs complete request URLs at INFO. OAuth exchanges and Graph API calls
# can include credentials in query strings, so never emit those URLs.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
