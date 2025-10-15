import re
from playwright.sync_api import sync_playwright, Page, expect

def verify_branching(page: Page):
    """
    Navigates to the chat page, sends a few messages,
    branches from the first one, and verifies the display.
    """
    page.goto("http://localhost:3000/chat")

    # Send first message
    page.get_by_placeholder("Discutez avec Jules...").fill("What is the capital of France?")
    page.locator('form button[type="submit"]').click()
    # Wait for the response to be fully streamed
    page.wait_for_function("() => document.querySelector('div.bg-gray-700.rounded-bl-none:last-of-type')?.textContent.length > 10", timeout=15000)


    # Send second message
    page.get_by_placeholder("Discutez avec Jules...").fill("What is its population?")
    page.locator('form button[type="submit"]').click()
    page.wait_for_function("() => document.querySelectorAll('div.bg-gray-700.rounded-bl-none').length === 2", timeout=15000)

    # Hover over the first model message to make the branch button visible
    first_model_message = page.locator("div.bg-gray-700.rounded-bl-none").first
    first_model_message.hover()

    # Click the branch button on the first model message
    branch_button = page.locator("button[aria-label='Branch from this message']").first
    branch_button.click()

    # Expect the input to be pre-filled with the first model's response
    expect(page.get_by_placeholder("Discutez avec Jules...")).not_to_be_empty()

    # Send a new message from the branch
    page.get_by_placeholder("Discutez avec Jules...").fill("I meant, what is the capital of Spain?")
    page.locator('form button[type="submit"]').click()

    # Wait for the new response to appear
    page.wait_for_function("() => document.querySelectorAll('div.bg-gray-700.rounded-bl-none').length === 2", timeout=15000)

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/branching_verification.png")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_branching(page)
        finally:
            browser.close()

if __name__ == "__main__":
    main()
