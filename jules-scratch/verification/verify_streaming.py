import re
from playwright.sync_api import sync_playwright, Page, expect

def verify_streaming(page: Page):
    """
    Navigates to the chat page, sends a message,
    and verifies that the response is streaming.
    """
    print("Navigating to the chat page...")
    page.goto("http://localhost:3000/chat")

    print("Typing a message...")
    page.get_by_placeholder("Discutez avec Jules...").fill("Hello, tell me a short story.")

    print("Waiting for the button to be enabled...")
    button = page.locator('form button[type="submit"]')
    expect(button).to_be_enabled(timeout=5000)

    print("Clicking the send button...")
    button.click()

    print("Waiting for the streaming response to appear...")
    # Use a more specific selector for the model's response bubble
    response_container = page.locator("div.bg-gray-700.rounded-bl-none").last
    expect(response_container).to_be_visible(timeout=10000)
    expect(response_container).not_to_be_empty(timeout=15000) # Increased timeout for model response

    # Wait for a moment to let the stream progress
    page.wait_for_timeout(2000)

    print("Taking a screenshot...")
    page.screenshot(path="jules-scratch/verification/streaming_verification.png")
    print("Screenshot saved to jules-scratch/verification/streaming_verification.png")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_streaming(page)
        finally:
            browser.close()

if __name__ == "__main__":
    main()
