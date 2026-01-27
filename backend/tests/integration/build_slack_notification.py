#!/usr/bin/env python3
"""
Build Slack notification payload for AI integration tests
"""
import json
import sys
import os

def build_slack_payload(provider, github_context):
    """Build Slack blocks format notification"""
    try:
        # Load performance data
        with open(f'performance_{provider}.json') as f:
            perf = json.load(f)
        
        # Load test results
        with open('integration_results.json') as f:
            results = json.load(f)
        
        # Load models
        with open('../backend/secure/allowed_models.json') as f:
            models_config = json.load(f)
            models = models_config.get(provider, [])
        
        # Extract metrics
        passed = perf.get('tests_passed', 0)
        failed = perf.get('tests_failed', 0)
        total = perf.get('tests_total', 0)
        duration_ms = perf.get('duration_ms', 0)
        avg_speed = perf.get('avg_inference_speed_ms', 0)
        
        duration_sec = duration_ms / 1000
        avg_sec = avg_speed / 1000
        
        # Build models text
        models_text = "\n".join([f"  • `{m}`" for m in models])
        
        # Build test results
        tests = results.get('tests', [])
        test_lines = []
        for test in tests:
            outcome = test.get('outcome', 'unknown')
            name = test.get('nodeid', '').split('::')[-1]
            emoji = '✅' if outcome == 'passed' else '❌' if outcome == 'failed' else '⚠️'
            duration = test.get('call', {}).get('duration', 0)
            test_name = name.replace('test_', '').replace('_', ' ').title()
            test_lines.append(f'{emoji} *{test_name}* — `{duration:.2f}s`')
        test_results = "\n".join(test_lines)
        
        # Determine status
        status_icon = "✅" if failed == 0 else "⚠️"
        status_text = "All Tests Passed" if failed == 0 else "Some Tests Failed"
        
        # Build Slack payload
        payload = {
            "text": f"{status_icon} AI Integration Test - {provider} - {status_text}",
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f" AI Integration Test - {provider}",
                        "emoji": True
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"{status_icon} *{status_text}* — Real API integration tests completed"
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
                        {"type": "mrkdwn", "text": f"* Total Tests*\n`{total}`"},
                        {"type": "mrkdwn", "text": f"*⏱️ Duration*\n`{duration_sec:.2f}s`"},
                        {"type": "mrkdwn", "text": f"*⚡ Avg Speed*\n`{avg_sec:.3f}s/test`"},
                        {"type": "mrkdwn", "text": f"* Branch*\n`{github_context['branch']}`"}
                    ]
                },
                {
                    "type": "divider"
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"* Models Tested*\n\n{models_text}"
                    }
                },
                {
                    "type": "divider"
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"* Test Results*\n\n{test_results}"
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
                            "text": f"⚙️ *Workflow:* `{github_context['workflow']}` •  *Triggered by:* `{github_context['event']}` • <{github_context['run_url']}| View Full Logs>"
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
    if len(sys.argv) < 6:
        print("Usage: build_slack_notification.py <provider> <branch> <workflow> <event> <run_url>")
        sys.exit(1)
    
    provider = sys.argv[1]
    github_context = {
        'branch': sys.argv[2],
        'workflow': sys.argv[3],
        'event': sys.argv[4],
        'run_url': sys.argv[5]
    }
    
    sys.exit(build_slack_payload(provider, github_context))
