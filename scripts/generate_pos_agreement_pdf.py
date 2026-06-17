"""
Generate a fillable Point of Sale (POS) Software & Support Agreement PDF for Business One.
Output: user's Downloads folder.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader, simpleSplit

# Brand colors — match Business One POS (css/pos.css)
BLUE = colors.HexColor("#1f82ff")
BLUE_LIGHT = colors.HexColor("#eef5ff")
ORANGE = colors.HexColor("#ff9b1f")
GRAY = colors.HexColor("#555555")
FIELD_BORDER = colors.HexColor("#bfdbfe")

PAGE_W, PAGE_H = letter
MARGIN = 0.55 * inch
CONTENT_W = PAGE_W - 2 * MARGIN

PROVIDER_NAME = "Business One"
PROVIDER_EMAIL = "info@businessonecomprehensive.com"
PROVIDER_PHONE = "(850) 290-2084"
PROVIDER_WEBSITE = "https://businessonecomprehensive.com/"
SINGLE_STATION_RATE = "$100.00"
ADDITIONAL_STATION_RATE = "$50.00"
VOLUME_STATION_RATE = "$25.00"

DOC_TITLE = "POINT OF SALE (POS) SOFTWARE & SUPPORT AGREEMENT"

LOGO_PATH = Path(__file__).resolve().parent / "assets" / "business-one-logo.png"
OUTPUT_PATH = Path.home() / "Downloads" / "POS-Software-Support-Agreement.pdf"


def draw_logo(c, x, y, height_inches=0.5):
    img = ImageReader(str(LOGO_PATH))
    iw, ih = img.getSize()
    h = height_inches * inch
    w = h * (iw / ih)
    c.drawImage(img, x, y, width=w, height=h, mask="auto", preserveAspectRatio=True)
    return w


def draw_section_header(c, y, title, color=BLUE, height=22):
    c.setFillColor(color)
    c.rect(MARGIN, y - height + 6, CONTENT_W, height, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(MARGIN + 8, y - height + 11, title)
    return y - height - 4


def draw_label(c, x, y, text, bold=False):
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", 7.5)
    c.drawString(x, y, text)


def draw_field_bg(c, x, y, w, h=14):
    c.setFillColor(BLUE_LIGHT)
    c.setStrokeColor(FIELD_BORDER)
    c.setLineWidth(0.5)
    c.rect(x, y, w, h, fill=1, stroke=1)


def draw_static_value(c, x, y, w, value):
    draw_field_bg(c, x, y - 16, w)
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 8)
    c.drawString(x + 4, y - 12, value)


def draw_pricing_box(c, x, y, w):
    draw_label(c, x, y, "Station Pricing:")
    box_h = 44
    draw_field_bg(c, x, y - box_h, w, h=box_h)
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 7.5)
    lines = [
        f"First station: {SINGLE_STATION_RATE}/month",
        f"Stations 2\u20135: {ADDITIONAL_STATION_RATE}/month each",
        f"Station 6 and above: {VOLUME_STATION_RATE}/month each",
    ]
    ly = y - 13
    for line in lines:
        c.drawString(x + 4, ly, line)
        ly -= 12
    return y - box_h - 6


def draw_footer(c):
    y = 0.42 * inch
    c.setStrokeColor(ORANGE)
    c.setLineWidth(1.5)
    c.line(MARGIN, y + 14, PAGE_W - MARGIN, y + 14)
    c.setFillColor(BLUE)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(MARGIN + CONTENT_W * 0.17, y, PROVIDER_WEBSITE)
    c.drawCentredString(MARGIN + CONTENT_W * 0.50, y, PROVIDER_PHONE)
    c.drawCentredString(MARGIN + CONTENT_W * 0.83, y, PROVIDER_EMAIL)


def draw_wrapped(c, x, y, w, text, size=7.2, leading=9.5, color=GRAY):
    c.setFillColor(color)
    c.setFont("Helvetica", size)
    lines = simpleSplit(text, "Helvetica", size, w)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_bullet_block(c, x, y, w, items, size=7.2, leading=10):
    c.setFillColor(GRAY)
    c.setFont("Helvetica", size)
    for item in items:
        lines = simpleSplit(item, "Helvetica", size, w - 12)
        c.drawString(x, y, "\u2022")
        for i, line in enumerate(lines):
            c.drawString(x + 10, y - i * leading, line)
        y -= leading * len(lines) + 2
    return y


def add_text_field(form, name, x, y, w, h=14, multiline=False):
    form.textfield(
        name=name,
        tooltip=name,
        x=x,
        y=y,
        width=w,
        height=h,
        borderStyle="inset",
        borderWidth=0,
        forceBorder=False,
        fillColor=BLUE_LIGHT,
        textColor=colors.black,
        fontSize=8,
        fieldFlags="multiline" if multiline else "",
    )


def add_checkbox(form, name, x, y, size=11):
    form.checkbox(
        name=name,
        tooltip=name,
        x=x,
        y=y,
        buttonStyle="check",
        size=size,
        borderWidth=1,
        borderColor=ORANGE,
        fillColor=colors.white,
        textColor=ORANGE,
        forceBorder=True,
    )


def draw_page_header(c, y, logo_height=0.5, title_size=12):
    logo_w = draw_logo(c, MARGIN, y - logo_height * inch, logo_height)
    c.setFillColor(BLUE)
    c.setFont("Helvetica-Bold", title_size)
    c.drawString(MARGIN + logo_w + 0.1 * inch, y - 0.17 * inch, DOC_TITLE)
    c.setStrokeColor(ORANGE)
    c.setLineWidth(2 if title_size >= 12 else 1.5)
    line_y = y - (0.56 if title_size >= 12 else 0.44) * inch
    c.line(MARGIN, line_y, PAGE_W - MARGIN, line_y)
    return y - (0.7 if title_size >= 12 else 0.56) * inch


def page1(c, form):
    y = draw_page_header(c, PAGE_H - MARGIN)

    intro = (
        f'This Point of Sale (POS) Software & Support Agreement ("Agreement") is entered into between '
        f'{PROVIDER_NAME} ("Provider") and the undersigned client ("Client"). '
        "This Agreement outlines the terms under which Provider will deliver Business One POS software "
        "access, setup support, and ongoing service to Client."
    )
    y = draw_wrapped(c, MARGIN, y, CONTENT_W, intro, size=7.5, leading=10) - 6

    y = draw_section_header(c, y, "1. Client & Business Information")
    col_w = (CONTENT_W - 16) / 2
    left_x = MARGIN
    right_x = MARGIN + col_w + 16
    field_y = y - 12

    draw_label(c, left_x, field_y, "Client Information", bold=True)
    draw_label(c, right_x, field_y, f"{PROVIDER_NAME} (Provider)", bold=True)
    field_y -= 14

    for fname, label in [
        ("client_name", "Client Name:"),
        ("client_email", "Email:"),
        ("client_phone", "Phone:"),
        ("client_billing_address", "Billing Address:"),
        ("client_city_state_zip", "City, State, ZIP:"),
    ]:
        draw_label(c, left_x, field_y, label)
        draw_field_bg(c, left_x, field_y - 16, col_w)
        add_text_field(form, fname, left_x + 1, field_y - 15, col_w - 2)
        field_y -= 28

    prov_y = y - 26
    for label, value in [
        ("Business Name:", PROVIDER_NAME),
        ("Email:", PROVIDER_EMAIL),
        ("Phone:", PROVIDER_PHONE),
    ]:
        draw_label(c, right_x, prov_y, label)
        draw_static_value(c, right_x, prov_y, col_w, value)
        prov_y -= 28

    y = min(field_y, prov_y) - 4
    y = draw_section_header(c, y, "2. POS & Service Details")

    field_y = y - 12
    for fname, label in [
        ("store_name", "Business / Store Name:"),
        ("number_of_stations", "Number of Stations:"),
        ("total_monthly_fee", "Total Monthly Fee:"),
        ("effective_date", "Effective Date:"),
    ]:
        draw_label(c, left_x, field_y, label)
        draw_field_bg(c, left_x, field_y - 16, col_w)
        fx = left_x + 1
        fw = col_w - 2
        if fname == "total_monthly_fee":
            c.setFillColor(GRAY)
            c.setFont("Helvetica", 8)
            c.drawString(left_x + 4, field_y - 12, "$")
            fx = left_x + 12
            fw = col_w - 14
        add_text_field(form, fname, fx, field_y - 15, fw)
        field_y -= 28

    right_y = y - 12
    right_y = draw_pricing_box(c, right_x, right_y, col_w)

    draw_label(c, right_x, right_y, "Billing Cycle:")
    draw_field_bg(c, right_x, right_y - 16, col_w)
    add_text_field(form, "billing_cycle", right_x + 1, right_y - 15, col_w - 2)
    right_y -= 28

    draw_label(c, right_x, right_y, "Initial Contract Term:")
    right_y -= 14
    add_checkbox(form, "term_month_to_month", right_x, right_y - 2)
    c.setFillColor(GRAY)
    c.setFont("Helvetica", 7.5)
    c.drawString(right_x + 14, right_y, "Month-to-Month")

    other_x = right_x + 110
    add_checkbox(form, "term_other", other_x, right_y - 2)
    c.drawString(other_x + 14, right_y, "Other:")
    draw_field_bg(c, other_x + 42, right_y - 4, col_w - (other_x - right_x) - 42, h=12)
    add_text_field(form, "term_other_text", other_x + 43, right_y - 3, col_w - (other_x - right_x) - 44, h=11)

    y = min(field_y, right_y) - 10
    y = draw_section_header(c, y, "3. Service Summary & Inclusions", color=ORANGE)

    c.setFillColor(GRAY)
    c.setFont("Helvetica", 7.5)
    c.drawString(
        MARGIN,
        y - 10,
        f"{PROVIDER_NAME} will provide the following POS software and support services (as selected in your plan):",
    )
    y -= 22

    services = [
        "Business One POS Register Software",
        "Customer Display Support",
        "Offline-Capable Sales Processing",
        "Cash & Card Payment Interface",
        "Real-Time Inventory Sync",
        "Sales Reporting & Analytics",
        "Employee PIN Access & Shift Tools",
        "Technical Support",
        "Software Updates & Maintenance",
        "Other Services as Agreed",
    ]
    cols = 3
    col_width = CONTENT_W / cols
    row_h = 20
    start_y = y
    for i, label in enumerate(services):
        col = i % cols
        row = i // cols
        sx = MARGIN + col * col_width
        sy = start_y - row * row_h
        c.setFillColor(ORANGE)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(sx, sy, "\u2022")
        c.setFillColor(GRAY)
        c.setFont("Helvetica", 7.2)
        c.drawString(sx + 10, sy, label)

    y = start_y - 3 * row_h - 6
    draw_label(c, MARGIN, y, "Special Terms / Notes:")
    draw_field_bg(c, MARGIN, y - 52, CONTENT_W, h=48)
    add_text_field(form, "special_terms", MARGIN + 2, y - 50, CONTENT_W - 4, h=46, multiline=True)

    draw_footer(c)
    c.showPage()


def page2(c, form):
    y = draw_page_header(c, PAGE_H - MARGIN, logo_height=0.38, title_size=10)

    y = draw_section_header(c, y, "4. Terms & Conditions")

    terms = [
        (
            "Services",
            "Provider agrees to furnish Business One POS software access, configuration assistance, and "
            "support as described in this Agreement. Services include register software, updates, and "
            "technical support during normal business hours unless otherwise agreed in writing.",
        ),
        (
            "Payment Processing",
            "Client is responsible for selecting and maintaining their own payment processor and merchant "
            "account. Provider supplies the POS interface only; card data is handled by Client's "
            "approved processor in accordance with applicable PCI and payment network requirements.",
        ),
        (
            "Hardware & Equipment",
            "Client is responsible for providing compatible devices (tablets, terminals, printers, and "
            "network connectivity) required to operate the POS. Provider may recommend hardware but "
            "does not supply equipment unless expressly agreed in writing.",
        ),
        (
            "Data & Inventory",
            "POS data syncs with Client's connected store backend when configured. Client is responsible "
            "for accurate product, pricing, and inventory data. Provider is not liable for discrepancies "
            "caused by incomplete or incorrect Client data.",
        ),
        (
            "Support",
            "Technical support is provided via email and phone during standard business hours. Response "
            "times may vary based on issue severity and current workload. On-site support may incur "
            "additional fees if agreed upon in advance.",
        ),
        (
            "Client Responsibilities",
            "Client agrees to provide timely access, store connection details, employee training, and "
            "accurate account information. Client is responsible for user access controls, compliance "
            "with applicable laws, and payment of all fees according to this Agreement.",
        ),
    ]

    for title, body in terms:
        c.setFillColor(BLUE)
        c.setFont("Helvetica-Bold", 7.8)
        c.drawString(MARGIN, y, title)
        y = draw_wrapped(c, MARGIN + 8, y - 10, CONTENT_W - 8, body, size=7, leading=9) - 4

    y = draw_section_header(c, y - 2, "5. Payment Terms")
    payment_items = [
        f"The first station is {SINGLE_STATION_RATE} per month. Stations 2 through 5 are {ADDITIONAL_STATION_RATE} per month each. "
        f"Each station beyond the fifth is {VOLUME_STATION_RATE} per month "
        "(e.g., 2 stations = $150.00/month; 5 stations = $300.00/month; 6 stations = $325.00/month).",
        "Fees are billed in advance on the billing cycle selected in Section 2.",
        "Payment is due upon receipt of invoice. Late payments may incur a late fee of 1.5% per month on outstanding balances.",
        "Provider may suspend POS access for accounts more than 15 days past due after written notice to Client.",
        "Fees paid are non-refundable except where required by law or expressly agreed in writing.",
    ]
    y = draw_bullet_block(c, MARGIN, y - 8, CONTENT_W, payment_items) - 2

    y = draw_section_header(c, y, "6. Termination")
    term_text = (
        "Either party may terminate this Agreement with thirty (30) days written notice. Client remains "
        "responsible for all fees incurred through the effective termination date. Upon termination, "
        "Provider will cooperate in a reasonable transition including deactivation of POS access and export of Client sales "
        "data where available, subject to outstanding account balances being paid in full."
    )
    y = draw_wrapped(c, MARGIN, y - 8, CONTENT_W, term_text, size=7, leading=9) - 4

    y = draw_section_header(c, y, "7. General Provisions")
    general_text = (
        "This Agreement constitutes the entire agreement between the parties regarding the subject matter "
        "hereof and supersedes all prior discussions or agreements. Any amendments must be in writing and "
        "signed by both parties. This Agreement shall be governed by the laws of the State of Florida."
    )
    y = draw_wrapped(c, MARGIN, y - 8, CONTENT_W, general_text, size=7, leading=9) - 8

    sig_w = (CONTENT_W - 20) / 2
    for sx, title, prefix in [
        (MARGIN, "CLIENT", "client"),
        (MARGIN + sig_w + 20, f"{PROVIDER_NAME.upper()} (PROVIDER)", "provider"),
    ]:
        c.setFillColor(ORANGE)
        c.rect(sx, y - 16, sig_w, 16, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(sx + sig_w / 2, y - 12, title)

        fy = y - 30
        for field_suffix, label in [
            ("signature", "Signature:"),
            ("signer_name", "Name:"),
            ("signer_title", "Title:"),
            ("sign_date", "Date:"),
        ]:
            fname = f"{prefix}_{field_suffix}"
            draw_label(c, sx, fy, label)
            draw_field_bg(c, sx, fy - 16, sig_w)
            add_text_field(form, fname, sx + 1, fy - 15, sig_w - 2)
            if field_suffix == "signature":
                c.setFillColor(ORANGE)
                c.setFont("Helvetica-Oblique", 6.5)
                c.drawRightString(sx + sig_w - 4, fy - 11, "Sign Here \u2190")
            fy -= 28

    draw_footer(c)
    c.showPage()


def main():
    if not LOGO_PATH.is_file():
        raise FileNotFoundError(f"Logo not found: {LOGO_PATH}")

    c = canvas.Canvas(str(OUTPUT_PATH), pagesize=letter)
    c.setTitle(DOC_TITLE)
    c.setAuthor(PROVIDER_NAME)
    form = c.acroForm

    page1(c, form)
    page2(c, form)

    c.save()
    print(f"Created: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
