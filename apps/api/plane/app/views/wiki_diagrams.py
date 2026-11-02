"""Authenticated, stateless PlantUML preview using the local isolated renderer."""
import base64
import re
import requests
from rest_framework import serializers
from rest_framework.response import Response
from plane.app.views.base import BaseAPIView
from plane.app.views.wiki import workspace_role


class PlantUMLInput(serializers.Serializer):
    source = serializers.CharField(max_length=20000, trim_whitespace=False)
    dark = serializers.BooleanField(default=False)

    def validate_source(self, source):
        source = source.replace('\r\n', '\n').strip()
        if not re.fullmatch(r'@startuml\s*\n[\s\S]*\n@enduml', source, re.I):
            raise serializers.ValidationError('Use one diagram enclosed in @startuml and @enduml on separate lines.')
        if len(re.findall(r'^\s*@(?:start|end)uml\b', source, re.I | re.M)) != 2:
            raise serializers.ValidationError('Preview one diagram at a time.')
        if re.search(r'^\s*!(?:include\w*|import|theme)\b|%(?:getenv|load\w*|file_exists)\s*\(', source, re.I | re.M):
            raise serializers.ValidationError('File access, includes and custom themes are not supported in previews.')
        return source


def themed_source(source, dark):
    first, body = source.split('\n', 1)
    return first + '\n!theme ' + ('cyborg' if dark else 'plain') + '\nskinparam backgroundColor transparent\n' + body


class WikiPlantUMLPreviewEndpoint(BaseAPIView):
    def post(self, request, slug):
        workspace_role(request.user, slug)
        serializer = PlantUMLInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            with requests.post('http://plantuml:8080/svg/', data=themed_source(data['source'], data['dark']).encode('utf-8'),
                headers={'Content-Type': 'text/plain; charset=utf-8'}, timeout=(2, 8), allow_redirects=False, stream=True) as result:
                error = result.headers.get('X-PlantUML-Diagram-Error')
                if error or result.status_code == 400:
                    # Renderer lines are zero-based; remove two injected lines and display one-based.
                    line = result.headers.get('X-PlantUML-Diagram-Error-Line', '').split(',')[0].strip()
                    line = max(1, int(line) - 1) if line.isdigit() else None
                    return Response({'error': 'Unable to preview PlantUML: ' + (error or 'Check the diagram syntax.'), 'line': line}, status=400)
                if result.status_code != 200 or 'image/svg+xml' not in result.headers.get('Content-Type', ''):
                    return Response({'error': 'The PlantUML renderer is unavailable. Try Preview again.'}, status=503)
                content = bytearray()
                for chunk in result.iter_content(16384):
                    content.extend(chunk)
                    if len(content) > 2_000_000:
                        return Response({'error': 'This diagram is too large to preview.'}, status=400)
                image = 'data:image/svg+xml;base64,' + base64.b64encode(content).decode('ascii')
                return Response({'image': image}, headers={'Cache-Control': 'no-store'})
        except requests.RequestException:
            return Response({'error': 'The PlantUML renderer is unavailable. Try Preview again.'}, status=503)
