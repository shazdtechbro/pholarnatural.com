from app.services.email_design import frame, inline_content


def _base(preheader, content):
    return frame(preheader, inline_content(content))
