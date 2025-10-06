import re
from playwright.sync_api import sync_playwright, Page, expect

def verify_code_generator(page: Page):
    """
    This script verifies the code generator feature.
    It navigates to the page, fills out the form, generates code,
    and captures a screenshot of the result.
    """
    # 1. Navigate to the code generator page.
    page.goto("http://localhost:3000/code-generator")

    # 2. Fill out the form.
    prompt_textarea = page.get_by_label("Prompt")
    filename_input = page.get_by_label("Filename")

    expect(prompt_textarea).to_be_visible()
    expect(filename_input).to_be_visible()

    prompt_textarea.fill("Create a simple Flask app with a single route that returns 'Hello, World!'")
    filename_input.fill("app.py")

    # 3. Click the generate button.
    generate_button = page.get_by_role("button", name="Generate Code")
    generate_button.click()

    # 4. Wait for the download link to appear and assert its visibility.
    # This confirms the API call was successful and the UI updated correctly.
    download_link = page.get_by_role("link", name=re.compile("Download app.py"))

    # Wait up to 30 seconds for the backend to respond
    expect(download_link).to_be_visible(timeout=30000)
    expect(page.get_by_text("✅ Code generated successfully!")).to_be_visible()

    # 5. Capture a screenshot for visual verification.
    page.screenshot(path="jules-scratch/verification/verification.png")

# --- Boilerplate to run the script ---
def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        verify_code_generator(page)
        browser.close()

if __name__ == "__main__":
    main()