# Highlighting System Testing Guide

This document outlines the test cases for validating the document viewer and chat orchestration system.

## Phase 6: Testing and Validation

### Test Case 1: Quote Extraction

**Objective**: Verify that all quotes are correctly extracted from AI responses.

**Test Steps**:
1. Open a markdown document in the viewer
2. Ask a question that should generate multiple quotes in the response
3. Verify that all quoted passages are extracted
4. Check console logs for `[handleHighlight] Extracted quoted phrases`

**Expected Results**:
- All quoted text (text within double quotes) is extracted
- Quotes with `[doc]` citations are prioritized
- At least 3-5 quotes should be extracted for complex responses

**Edge Cases to Test**:
- Nested quotes
- Quotes with special characters
- Very long quotes (>200 characters)
- Very short quotes (<10 characters)
- Quotes spanning multiple sentences

---

### Test Case 2: Highlighting Accuracy

**Objective**: Verify that quotes highlight exactly (character-perfect) in the document.

**Test Steps**:
1. Use a markdown document with known content
2. Ask a question that generates a specific quote
3. Verify the highlighted text matches the quote exactly
4. Check that no extra characters are highlighted
5. Check that no characters are missing

**Expected Results**:
- Highlighted text matches the quoted text character-for-character
- Highlight appears at the correct position in the document
- No extra whitespace or characters are included

**Edge Cases to Test**:
- Exact matches (should use 'exact' confidence)
- Near-matches with punctuation differences (should use 'normalized' confidence)
- Fuzzy matches with minor word differences (should use 'fuzzy' confidence)
- Approximate matches when exact position fails (should use 'approximate' confidence with dashed border)

---

### Test Case 3: Multiple Quote Highlighting

**Objective**: Verify that multiple quotes are highlighted simultaneously.

**Test Steps**:
1. Ask a question that generates 3+ quotes
2. Enable auto-highlight toggle
3. Verify all quotes are highlighted
4. Verify document scrolls to the first (topmost) quote

**Expected Results**:
- All quotes from the AI response are highlighted
- Highlights appear in the correct order (sorted by position)
- Document automatically scrolls to the first highlight
- All highlights are visible (not overlapping incorrectly)

**Edge Cases to Test**:
- Overlapping quotes (should handle gracefully)
- Quotes very close together
- Quotes at the beginning and end of document
- 10+ quotes in a single response

---

### Test Case 4: Auto-Highlight Toggle Behavior

**Objective**: Verify auto-highlight toggle works correctly.

**Test Steps**:
1. **Toggle ON**:
   - Enable auto-highlight toggle
   - Send a message with quotes
   - Verify all quotes highlight automatically
   - Verify scroll to first quote

2. **Toggle OFF**:
   - Disable auto-highlight toggle
   - Send a message with quotes
   - Verify no highlights appear automatically

3. **Icon Click with Toggle OFF**:
   - Keep toggle OFF
   - Click a highlight icon next to a quote
   - Verify only that specific quote highlights
   - Verify document scrolls to that quote

4. **Icon Click with Toggle ON**:
   - Keep toggle ON
   - Click a highlight icon next to a quote
   - Verify all quotes remain highlighted
   - Verify document scrolls to the clicked quote

**Expected Results**:
- Toggle ON: All quotes highlight, scroll to first
- Toggle OFF: No auto-highlight, but icon clicks work
- Icon clicks always scroll to the specific quote

---

### Test Case 5: Content Source Consistency

**Objective**: Verify that markdown documents use the same content source for RAG and viewing.

**Test Steps**:
1. Upload a markdown file
2. Verify it's stored in `document_pages.text_content`
3. Ask a question about the document
4. Verify the quote matches exactly what's in the viewer
5. Check that viewer loads from `/api/documents/[id]/text-content` endpoint

**Expected Results**:
- Viewer content matches RAG search content exactly
- No discrepancies between what AI sees and what user sees
- textSpan positions are accurate

---

### Test Case 6: Fallback Strategies

**Objective**: Verify fallback strategies work when exact match fails.

**Test Steps**:
1. Create a scenario where exact textSpan match fails (e.g., content slightly modified)
2. Verify normalized matching is attempted
3. Verify fuzzy matching is attempted if normalized fails
4. Verify approximate highlighting if all else fails
5. Check visual indicator (dashed border) for approximate matches

**Expected Results**:
- System tries exact → normalized → fuzzy → approximate
- Approximate matches show dashed border and tooltip
- Console logs indicate which strategy was used
- User still sees a highlight (even if approximate)

---

### Test Case 7: Highlight Icon Functionality

**Objective**: Verify highlight icons work correctly.

**Test Steps**:
1. Generate an AI response with multiple quotes
2. Verify highlight icons appear next to each quote with `[doc]` citation
3. Click each icon individually
4. Verify document scrolls to the correct quote
5. Verify only that quote highlights (if auto-highlight is OFF)

**Expected Results**:
- Icons appear for all document quotes
- Icons are clickable and scroll to correct position
- Individual highlighting works when auto-highlight is OFF
- All quotes remain highlighted when auto-highlight is ON

---

### Test Case 8: Error Handling

**Objective**: Verify system handles errors gracefully.

**Test Steps**:
1. Test with invalid textSpan positions
2. Test with missing document content
3. Test with very large documents
4. Test with documents that have no matching quotes
5. Test network errors during phrase search

**Expected Results**:
- Invalid textSpans are skipped with warnings
- System falls back to approximate highlighting when possible
- Errors are logged but don't crash the UI
- User sees helpful error messages when appropriate

---

## Validation Checklist

- [ ] All quotes are extracted correctly
- [ ] Highlights match quotes exactly (character-perfect)
- [ ] Multiple quotes highlight simultaneously
- [ ] Auto-highlight toggle works as expected
- [ ] Highlight icons scroll to correct quotes
- [ ] Content source is consistent between RAG and viewer
- [ ] Fallback strategies work when exact match fails
- [ ] Error handling is graceful
- [ ] Performance is acceptable with many highlights
- [ ] Works correctly with markdown, text, and PDF documents

---

## Performance Benchmarks

- Quote extraction: < 100ms for typical responses
- Highlight rendering: < 200ms for 10 highlights
- Scroll to highlight: < 500ms
- Phrase search API: < 1s for typical documents

---

## Known Limitations

1. Approximate matches may highlight slightly incorrect text
2. Very long quotes (>2000 chars) may be skipped
3. Overlapping highlights may have visual issues
4. Fuzzy matching may be slow for very long documents

