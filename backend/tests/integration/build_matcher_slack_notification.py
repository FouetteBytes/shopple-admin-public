#!/usr/bin/env python3
"""
Build Slack notification payload for Intelligent Product Matcher tests
"""
import json
import sys
import os

def build_slack_payload(github_context):
    """Build Slack blocks format notification for matcher tests"""
    try:
        # Load performance data
        with open('matcher_performance.json') as f:
            perf = json.load(f)
        
        # Load test results
        with open('matcher_results.json') as f:
            results = json.load(f)
        
        # Extract metrics
        passed = perf.get('tests_passed', 0)
        failed = perf.get('tests_failed', 0)
        total = perf.get('tests_total', 0)
        duration = perf.get('duration_seconds', 0)
        coverage = perf.get('coverage', 'N/A')
        
        # Build test results with better descriptions
        tests = results.get('tests', [])
        test_lines = []
        
        # Map test names to descriptive explanations
        test_descriptions = {
            'test_normalize_product_name_handles_brand': 'Brand name normalization and removal',
            'test_generate_search_tokens_captures_core_terms': 'Search token generation from product attributes',
            'test_brand_named_similarity_boost': 'Brand-named product matching with similarity scoring'
        }
        
        for test in tests:
            outcome = test.get('outcome', 'unknown')
            name = test.get('nodeid', '').split('::')[-1]
            emoji = '✅' if outcome == 'passed' else '❌' if outcome == 'failed' else '⚠️'
            duration_val = test.get('call', {}).get('duration', 0)
            
            # Format duration - show ms if less than 1 second
            if duration_val < 1.0:
                duration_str = f"{duration_val*1000:.0f}ms"
            else:
                duration_str = f"{duration_val:.2f}s"
            
            # Get description or format test name nicely
            description = test_descriptions.get(name, name.replace('test_', '').replace('_', ' ').title())
            test_lines.append(f'{emoji} *{description}* — `{duration_str}`')
        
        test_results = "\n".join(test_lines) if test_lines else "No test results"
        
        # Determine status
        status_icon = "✅" if failed == 0 else "⚠️"
        status_text = "All Tests Passed" if failed == 0 else "Some Tests Failed"
        
        # Build Slack payload
        payload = {
            "text": f"{status_icon} Intelligent Product Matcher Tests - {status_text}",
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": "🧠 Intelligent Product Matcher Tests",
                        "emoji": True
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"{status_icon} *{status_text}* — Unit tests for intelligent product matching algorithm"
                    }
                },
                {
                    "type": "divider"
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*✅ Tests Passed*\n`{passed}`"},
                        {"type": "mrkdwn", "text": f"*❌ Tests Failed*\n`{failed}`"},
                        {"type": "mrkdwn", "text": f"*📊 Total Tests*\n`{total}`"},
                        {"type": "mrkdwn", "text": f"*⏱️ Duration*\n`{duration}s`"},
                        {"type": "mrkdwn", "text": f"*📈 Coverage*\n`{coverage}`"},
                        {"type": "mrkdwn", "text": f"*🌿 Branch*\n`{github_context['branch']}`"}
                    ]
                },
                {
                    "type": "divider"
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*🧪 Matching Algorithm Tests*\n\n{test_results}"
                    }
                },
                {
                    "type": "divider"
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"⚙️ *Workflow:* `{github_context['workflow']}` • 👤 *Triggered by:* `{github_context['event']}` • <{github_context['run_url']}|📋 View Full Logs>"
                        }
                    ]
                }
            ]
        }
        
        # Save payload to file
        with open('slack_payload.json', 'w') as f:
            json.dump(payload, f, indent=2)
        
        print("✅ Slack payload created successfully")
        return 0
        
    except Exception as e:
        print(f"❌ Error creating Slack payload: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: build_matcher_slack_notification.py <branch> <workflow> <event> <run_url>")
        sys.exit(1)
    
    github_context = {
        'branch': sys.argv[1],
        'workflow': sys.argv[2],
        'event': sys.argv[3],
        'run_url': sys.argv[4]
    }
    
    sys.exit(build_slack_payload(github_context))
