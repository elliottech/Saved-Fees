FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN python -c "\
import urllib.request, zipfile, os; \
needed = {'JetBrainsMono-Regular.ttf', 'JetBrainsMono-Bold.ttf', 'JetBrainsMono-ExtraBold.ttf'}; \
os.makedirs('fonts', exist_ok=True); \
urllib.request.urlretrieve('https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip', '/tmp/f.zip'); \
z = zipfile.ZipFile('/tmp/f.zip'); \
[open(os.path.join('fonts', os.path.basename(n)), 'wb').write(z.read(n)) for n in z.namelist() if os.path.basename(n) in needed]; \
z.close(); os.remove('/tmp/f.zip')"
CMD ["python", "main.py"]
