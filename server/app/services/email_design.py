"""Shared, email-client-safe Pholar Natural design. Content must be escaped by callers."""
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlsplit

SITE = "https://pholarnatural.com"
GREEN = "#334537"


def safe(value):
    return escape(str(value if value is not None else ""), quote=True)


def paragraph(value):
    return '<p style="margin:0 0 18px;font:16px/1.7 Arial,Helvetica,sans-serif;color:#434843;overflow-wrap:anywhere">' + safe(value).replace("\n", "<br>") + '</p>'


def heading(value):
    return '<h1 style="margin:0 0 24px;font:normal 32px/1.2 Georgia,Times,serif;color:#334537">' + safe(value) + '</h1>'


def action(url, label):
    # Never introduce executable or protocol-relative URLs in transactional mail.
    parsed = urlsplit(url)
    if parsed.scheme not in ("https", "http") or not parsed.netloc:
        raise ValueError("Email actions require an absolute HTTP(S) URL")
    return ('<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;width:auto"><tr>'
            '<td bgcolor="#334537" style="border-radius:28px;text-align:center;mso-padding-alt:15px 28px">'
            '<a href="' + safe(url) + '" style="display:inline-block;padding:15px 28px;border:1px solid #334537;border-radius:28px;'
            'font:bold 15px/1.4 Arial,Helvetica,sans-serif;text-decoration:none;color:#ffffff;text-align:center">'
            + safe(label) + '</a></td></tr></table>'
            '<p style="margin:0 0 24px;font:12px/1.6 Arial,Helvetica,sans-serif;color:#737872">'
            'Button not opening? <a href="' + safe(url) + '" style="color:#334537;text-decoration:underline">Use this link instead</a>.</p>')


def reference(value, label="Reference"):
    # JavaScript/clipboard handlers are stripped by major mail clients. Keep the exact
    # value selectable and free of decorative characters so long-press/Copy works.
    return ('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px">'
            '<tr><td bgcolor="#f6f3ec" style="padding:18px 20px;border:1px solid #e5e2db;border-radius:12px">'
            '<p style="margin:0 0 6px;font:bold 11px/1.5 Arial,Helvetica,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#737872">'
            + safe(label) + '</p><p style="margin:0;font:bold 21px/1.5 Consolas,monospace;color:#334537;overflow-wrap:anywhere">'
            '<span style="user-select:all;-webkit-user-select:all">' + safe(value) + '</span></p>'
            '<p style="margin:6px 0 0;font:12px/1.5 Arial,Helvetica,sans-serif;color:#737872">Select or press and hold to copy.</p>'
            '</td></tr></table>')


def details(rows, total=None):
    body = ''.join('<tr><td style="padding:10px 0;border-bottom:1px solid #ebe8e1;font:14px/1.6 Arial,Helvetica,sans-serif;color:#434843;overflow-wrap:anywhere">'
                   + safe(label) + '</td><td align="right" style="padding:10px 0 10px 16px;border-bottom:1px solid #ebe8e1;font:14px/1.6 Arial,Helvetica,sans-serif;color:#334537;overflow-wrap:anywhere">'
                   + ('<span style="white-space:nowrap">' + safe(value) + '</span>' if str(value).startswith(('USD ', 'CAD ', '−USD ', '−CAD ')) else safe(value)) + '</td></tr>' for label, value in rows)
    result = '<table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px">' + body + '</table>'
    if total:
        result += ('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px"><tr>'
                   '<td bgcolor="#334537" style="padding:18px;border-radius:10px 0 0 10px;font:bold 15px/1.5 Arial,Helvetica,sans-serif;color:#ffffff">' + safe(total[0]) + '</td>'
                   '<td bgcolor="#334537" align="right" style="padding:18px;border-radius:0 10px 10px 0;font:bold 19px/1.5 Arial,Helvetica,sans-serif;color:#ffffff">' + safe(total[1]) + '</td></tr></table>')
    return result


class _InlineStyles(HTMLParser):
    """Apply essential inline styles to our existing trusted newsletter/page fragments."""
    styles = {
        "h1": "margin:0 0 24px;font:normal 32px/1.2 Georgia,Times,serif;color:#334537",
        "p": "margin:0 0 18px;font:16px/1.7 Arial,Helvetica,sans-serif;color:#434843;overflow-wrap:anywhere",
        "a": "color:#334537;text-decoration:underline;overflow-wrap:anywhere",
        "button": "padding:15px 28px;border:0;border-radius:28px;background:#334537;color:white;font:bold 15px/1.4 Arial,Helvetica,sans-serif;cursor:pointer",
    }

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        attrs = list(attrs)
        if tag in self.styles and not any(name == "style" for name, _ in attrs):
            attrs.append(("style", self.styles[tag]))
        self.parts.append('<' + tag + ''.join(' ' + name + ('="' + safe(value) + '"' if value is not None else '') for name, value in attrs) + '>')

    def handle_endtag(self, tag):
        self.parts.append('</' + tag + '>')

    def handle_data(self, data):
        self.parts.append(data)

    def handle_entityref(self, name):
        self.parts.append('&' + name + ';')

    def handle_charref(self, name):
        self.parts.append('&#' + name + ';')


def inline_content(content):
    parser = _InlineStyles()
    parser.feed(content)
    parser.close()
    return ''.join(parser.parts)


def frame(title, content):
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">'
            '<title>' + safe(title) + ' · Pholar Natural</title>'
            '<style>body{margin:0;padding:0}table{border-collapse:collapse}img{border:0;outline:none;text-decoration:none}'
            '@media only screen and (max-width:600px){.email-outer{padding:16px 8px!important}.email-content{padding:28px 22px!important}.email-brand{padding:24px 22px!important}h1{font-size:28px!important}}</style>'
            '</head><body bgcolor="#fcf9f2" style="margin:0;padding:0;background:#fcf9f2;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif;color:#334537">'
            '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">' + safe(title) + '</div>'
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fcf9f2"><tr><td class="email-outer" align="center" style="padding:40px 16px">'
            '<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->'
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e2db">'
            '<tr><td bgcolor="#334537" height="5" style="height:5px;font-size:0;line-height:0">&nbsp;</td></tr>'
            '<tr><td class="email-brand" style="padding:30px 36px;border-bottom:1px solid #ebe8e1">'
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="56" style="vertical-align:middle">'
            '<a href="' + SITE + '" aria-label="Pholar Natural"><img src="' + SITE + '/apple-touch-icon.png" width="48" height="48" alt="Pholar Natural leaf logo" style="display:block;width:48px;height:48px"></a>'
            '</td><td style="vertical-align:middle;padding-left:12px">'
            '<p style="margin:0;font:bold 24px/1.2 Georgia,Times,serif;letter-spacing:2px;color:#334537">PHOLAR</p>'
            '<p style="margin:5px 0 0;font:10px/1.2 Arial,Helvetica,sans-serif;letter-spacing:4px;color:#7d562d">NATURAL</p>'
            '</td></tr></table></td></tr>'
            '<tr><td class="email-content" style="padding:36px">' + content + '</td></tr>'
            '<tr><td bgcolor="#f6f3ec" style="padding:24px 28px;text-align:center;border-top:1px solid #ebe8e1">'
            '<p style="margin:0 0 12px;font:italic 17px/1.5 Georgia,Times,serif;color:#334537">Nature’s finest for your crown.</p>'
            '<p style="margin:0;font:12px/1.7 Arial,Helvetica,sans-serif;color:#737872">Need a hand? <a href="' + SITE + '/contact" style="color:#334537;text-decoration:underline">Contact Pholar Natural</a></p>'
            '<p style="margin:12px 0 0;font:11px/1.7 Arial,Helvetica,sans-serif;color:#737872">Pholar Natural · Toronto, Canada<br>'
            '<a href="' + SITE + '" style="color:#737872;text-decoration:underline">pholarnatural.com</a></p>'
            '</td></tr></table><!--[if mso]></td></tr></table><![endif]-->'
            '</td></tr></table></body></html>')
