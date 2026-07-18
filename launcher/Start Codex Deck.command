#!/bin/zsh
set -u

script_dir="${0:A:h}"
"$script_dir/start-codex-deck.sh" start
status=$?

if [[ $status -eq 2 ]]; then
  print
  print "May I restart Codex once to verify the macOS bridge? Any unsent composer text should be saved first."
  read "answer?Type yes to continue: "
  if [[ "$answer" == "yes" ]]; then
    "$script_dir/start-codex-deck.sh" start --restart
    status=$?
  else
    print "Codex was left running and unchanged."
    status=0
  fi
fi

if [[ -t 0 ]]; then
  print
  read "_?Press Return to close this window."
fi
exit $status
