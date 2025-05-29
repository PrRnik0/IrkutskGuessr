from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from app.models import Location, Set, User, CompetitionResult
from app import db
import os
from config import Config
from werkzeug.utils import secure_filename
import random
import uuid
import re
from flask_login import login_user, logout_user, login_required, current_user


bp = Blueprint('main', __name__)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

def generate_unique_filename(filename):
    ext = filename.rsplit('.', 1)[1].lower()
    unique_filename = f"{uuid.uuid4().hex}.{ext}"
    return unique_filename

@bp.route('/')
def index():
    return render_template('game.html', location=None)

@bp.route('/api/game')
def api_game():
    set_code = request.args.get('set_code', 'aaaaaa')  # По умолчанию 'aaaaaa'
    
    # Получаем набор по коду или используем начальный набор
    current_set = Set.query.filter_by(code=set_code).first()
    if not current_set:
        return jsonify({'error': 'Set not found'}), 404
    
    locations = current_set.locations
    if not locations:
        return jsonify({'error': 'No locations available in this set'}), 404
    
    random_location = random.choice(locations)
    return jsonify({
        'location': {
            'id': random_location.id,
            'title': random_location.title,
            'description': random_location.description,
            'lat': float(random_location.lat),
            'lng': float(random_location.lng),
            'image_filename': random_location.image_filename,
        }
    })


@bp.route('/user', methods=['GET', 'POST'])
@login_required
def user_page():
    if request.method == 'POST':
        # Handle set creation
        if 'create_set' in request.form:
            set_name = request.form['set_name']
            is_public = 'is_public' in request.form
            competition_count = int(request.form.get('competition_count', 0))
            max_attempts = int(request.form.get('max_attempts', 3))
            
            if set_name:
                new_set = Set(
                    name=set_name,
                    creator_id=current_user.id,
                    is_public=is_public,
                    competition_count=competition_count,
                    max_attempts=max_attempts
                )
                db.session.add(new_set)
                db.session.commit()
                flash(f'Набор "{set_name}" успешно создан! Код: {new_set.code}', 'success')
                return redirect(url_for('main.user_page'))

        # Handle set deletion
        elif 'delete_set' in request.form:
            set_id = request.form['delete_set']
            set_to_delete = Set.query.get(set_id)
            if set_to_delete and set_to_delete.creator_id == current_user.id:
                db.session.delete(set_to_delete)
                db.session.commit()
                flash('Набор успешно удален!', 'success')
                return redirect(url_for('main.user_page'))
            else:
                flash('Вы не можете удалить этот набор!', 'danger')
                return redirect(url_for('main.user_page'))

    # Get user's locations and sets
    user_locations = Location.query.filter_by(creator_id=current_user.id).all()
    user_sets = Set.query.filter_by(creator_id=current_user.id).all()
    
    return render_template('user.html', user_locations=user_locations, user_sets=user_sets)

@bp.route('/admin', methods=['GET', 'POST'])
@login_required
def admin():
    if not current_user.is_authenticated or current_user.role != 'admin':
        flash('Доступ запрещен: требуется роль администратора.', 'danger')
        return redirect(url_for('main.index'))
    
    if request.method == 'POST':
        # Handle set creation
        if 'create_set' in request.form:
            set_name = request.form['set_name']
            is_public = 'is_public' in request.form
            competition_count = int(request.form.get('competition_count', 0))
            max_attempts = int(request.form.get('max_attempts', 3))  # Get max attempts
            
            if set_name:
                new_set = Set(
                    name=set_name,
                    creator_id=current_user.id,
                    is_public=is_public,
                    competition_count=competition_count,
                    max_attempts=max_attempts
                )
                db.session.add(new_set)
                db.session.commit()
                flash(f'Набор "{set_name}" успешно создан! Код: {new_set.code}', 'success')

        # Handle set deletion
        elif 'delete_set' in request.form:
            set_id = request.form['delete_set']
            set_to_delete = Set.query.get(set_id)
            if set_to_delete and not set_to_delete.is_protected:
                # Delete all locations and their images first
                for location in set_to_delete.locations:
                    if location.image_filename:
                        try:
                            os.remove(os.path.join(Config.UPLOAD_FOLDER, location.image_filename))
                        except OSError:
                            pass
                    db.session.delete(location)
                db.session.delete(set_to_delete)
                db.session.commit()
                flash('Набор успешно удален!', 'success')
            elif set_to_delete and set_to_delete.is_protected:
                flash('Этот набор защищен от удаления!', 'danger')
        # Handle admin promotion/demotion
        elif 'promote_to_admin' in request.form:
            user_id = request.form['promote_to_admin']
            user = User.query.get(user_id)
            if user:
                user.role = 'admin' if user.role != 'admin' else 'user'  # Переключаем роль
                db.session.commit()
                action = "теперь администратор" if user.role == 'admin' else "больше не администратор"
                flash(f'Пользователь {user.username} {action}!', 'success')
    
    sets = Set.query.all()
    users = User.query.all()
    all_locations = Location.query.all()
    return render_template('admin.html', sets=sets, users=users, all_locations=all_locations)

@bp.route('/admin/set/<int:set_id>', methods=['GET', 'POST'])
@login_required
def manage_set(set_id):
    # Check admin permissions first
    if not current_user.is_authenticated or current_user.role != 'admin':
        flash('Доступ запрещен: требуется роль администратора.', 'danger')
        return redirect(url_for('main.index'))

    # Get the current set - this should always exist or return 404
    current_set = Set.query.get_or_404(set_id)
    
    # Initialize variables that will be used in the template
    locations = current_set.locations
    all_locations = Location.query.all()

    if request.method == 'POST':
        # Handle adding existing location
        if 'add_existing_location' in request.form:
            location_id = request.form['add_existing_location']
            location = Location.query.get(location_id)
            if location and current_set:
                # Для many-to-many добавляем через отношение
                current_set.locations.append(location)
                db.session.commit()
                flash('Локация успешно добавлена в набор!', 'success')
                return redirect(url_for('main.manage_set', set_id=set_id))
            
        # Handle location removal
        if 'remove_location' in request.form:
            location_id = request.form['remove_location']
            location = Location.query.get(location_id)
            if location and current_set:
                # Для many-to-many удаляем через отношение
                current_set.locations.remove(location)
                db.session.commit()
                flash('Локация удалена из набора!', 'warning')
                return redirect(url_for('main.manage_set', set_id=set_id))
            
        # Handle new location creation
        if 'add_location' in request.form:
            title = request.form['title']
            lat = request.form['lat']
            lng = request.form['lng']
            description = request.form['description']
            
            file = request.files['image']
            if file and allowed_file(file.filename):
                original_filename = secure_filename(file.filename)
                filename = generate_unique_filename(original_filename)
                
                os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
                file.save(os.path.join(Config.UPLOAD_FOLDER, filename))
                
                new_location = Location(
                    title=title,
                    lat=lat,
                    lng=lng,
                    description=description,
                    image_filename=filename,
                    creator_id=current_user.id,
                    is_private='is_private' in request.form
                )
                db.session.add(new_location)
                # Добавляем в набор через отношение many-to-many
                current_set.locations.append(new_location)
                db.session.commit()
                flash('Локация успешно добавлена!', 'success')
                return redirect(url_for('main.manage_set', set_id=set_id))
        
        # Handle location deletion
        elif 'delete_id' in request.form:
            location = Location.query.get(request.form['delete_id'])
            if location:
                if location.image_filename:
                    try:
                        os.remove(os.path.join(Config.UPLOAD_FOLDER, location.image_filename))
                    except OSError:
                        pass
                
                db.session.delete(location)
                db.session.commit()
                flash('Локация удалена!', 'warning')
                return redirect(url_for('main.manage_set', set_id=set_id))
        
        # Handle location editing
        elif 'edit_location' in request.form:
            location_id = request.form['location_id']
            location = Location.query.get(location_id)
            if location:
                location.title = request.form['edit_title']
                location.lat = request.form['edit_lat']
                location.lng = request.form['edit_lng']
                location.description = request.form['edit_description']
                
                if 'edit_image' in request.files:
                    file = request.files['edit_image']
                    if file and allowed_file(file.filename):
                        if location.image_filename:
                            try:
                                os.remove(os.path.join(Config.UPLOAD_FOLDER, location.image_filename))
                            except OSError:
                                pass
                        
                        original_filename = secure_filename(file.filename)
                        filename = generate_unique_filename(original_filename)
                        file.save(os.path.join(Config.UPLOAD_FOLDER, filename))
                        location.image_filename = filename
                
                db.session.commit()
                flash('Локация успешно обновлена!', 'success')
                return redirect(url_for('main.manage_set', set_id=set_id))

    # For GET requests or if no POST action matched
    return render_template(
        'manage_set.html', 
        set=current_set, 
        locations=locations, 
        all_locations=all_locations
    )
@bp.route('/register', methods=['POST'])
def register():
    email = request.form.get('email')
    username = request.form.get('username')
    password = request.form.get('password')
    confirm_password = request.form.get('confirm_password')
    
    if not all([email, username, password, confirm_password]):
        return jsonify({'error': 'Все поля обязательны для заполнения'}), 400
    
    if password != confirm_password:
        return jsonify({'error': 'Пароли не совпадают'}), 400
    
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        return jsonify({'error': 'Некорректный формат почты'}), 400
    
    if len(password) < 4:
        return jsonify({'error': 'Пароль должен содержать минимум 4 символа'}), 400
    
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({'error': 'Пользователь с такой почтой уже существует'}), 400
    


    # Создаем нового пользователя
    new_user = User(email=email, username=username)
    new_user.set_password(password)
    
    # Если это первый пользователь, делаем его админом
    if User.is_database_empty():
        new_user.role = 'admin'
    
    db.session.add(new_user)
    db.session.commit()
    
    login_user(new_user)
    return jsonify({
        'success': True, 
        'username': username,
        'is_admin': new_user.role == 'admin'
    })

@bp.route('/login', methods=['POST'])
def login():
    email = request.form.get('email')
    password = request.form.get('password')
    
    if not all([email, password]):
        return jsonify({'error': 'Почта и пароль обязательны'}), 400
    
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Неверная почта или пароль'}), 401
    
    login_user(user)
    return jsonify({'success': True, 'username': user.username})

@bp.route('/logout')
@login_required
def logout():
    logout_user()
    return jsonify({'success': True})

@bp.route('/check_auth')
def check_auth():
    return jsonify({
        'authenticated': current_user.is_authenticated,
        'username': current_user.username if current_user.is_authenticated else None,
        'email': current_user.email if current_user.is_authenticated else None,
        'is_admin': current_user.is_authenticated and current_user.role == 'admin'
    })

@bp.route('/api/set_exists')
def api_set_exists():
    code = request.args.get('code')
    if not code:
        return jsonify({'error': 'Code parameter is required'}), 400
    
    set_exists = db.session.query(Set.query.filter_by(code=code).exists()).scalar()
    return jsonify({'exists': set_exists})

@bp.route('/api/public_sets')
def api_public_sets():
    public_sets = Set.query.filter_by(is_public=True).all()
    result = []
    
    for set in public_sets:
        # Используем list() для преобразования динамического запроса в список
        locations = list(set.locations)
        sample_images = []
        if locations:
            random_locations = random.sample(locations, min(5, len(locations)))
            sample_images = [loc.image_filename for loc in random_locations if loc.image_filename]
        
        result.append({
            'id': set.id,
            'name': set.name,
            'code': set.code,
            'competition_count': set.competition_count,
            'sample_images': sample_images
        })
    
    return jsonify(result)

@bp.route('/api/set_info')
def api_set_info():
    set_id = request.args.get('id')
    code = request.args.get('code')
    
    if set_id:
        set = Set.query.get(set_id)
    elif code:
        set = Set.query.filter_by(code=code).first()
    else:
        return jsonify({'error': 'Set ID or code is required'}), 400
    
    if not set:
        return jsonify({'error': 'Set not found'}), 404
    
    # Используем len() для подсчета локаций в динамическом запросе
    locations_count = len(list(set.locations))
    
    return jsonify({
        'id': set.id,
        'name': set.name,
        'code': set.code,
        'competition_count': set.competition_count, 
        'max_attempts': set.max_attempts,
        'locations_count': locations_count
    })

@bp.route('/api/competition_locations')
@login_required
def api_competition_locations():
    set_id = request.args.get('set_id')
    count = int(request.args.get('count', 5))
    
    if not set_id:
        return jsonify({'error': 'Set ID is required'}), 400
    
    current_set = Set.query.get(set_id)
    if not current_set:
        return jsonify({'error': 'Set not found'}), 404
    
    # Используем list() для преобразования динамического запроса
    locations = list(current_set.locations)
    if not locations:
        return jsonify({'error': 'No locations available in this set'}), 404
    
    # Выбираем случайные локации в количестве count
    selected_locations = random.sample(locations, min(count, len(locations)))
    
    return jsonify([{
        'id': loc.id,
        'title': loc.title,
        'description': loc.description,
        'lat': float(loc.lat),
        'lng': float(loc.lng),
        'image_filename': loc.image_filename
    } for loc in selected_locations])


@bp.route('/api/user_competition_results')
@login_required
def api_user_competition_results():
    set_id = request.args.get('set_id')
    if not set_id:
        return jsonify({'error': 'Set ID is required'}), 400
    
    result = CompetitionResult.query.filter_by(
        user_id=current_user.id,
        set_id=set_id
    ).order_by(CompetitionResult.attempts.desc()).first()
    
    if not result:
        return jsonify(None)
    
    return jsonify({
        'score': result.score,
        'duration_seconds': result.duration_seconds,
        'attempts': result.attempts,
        'created_at': result.created_at.isoformat()
    })

@bp.route('/api/save_competition_result', methods=['POST'])
@login_required
def api_save_competition_result():
    data = request.get_json()
    if not all(key in data for key in ['set_id', 'score', 'duration_seconds', 'attempts']):
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Проверяем, что у пользователя не больше попыток, чем разрешено
    current_set = Set.query.get(data['set_id'])
    if not current_set:
        return jsonify({'error': 'Set not found'}), 404
    
    # Находим последний результат пользователя для этого набора
    existing_result = CompetitionResult.query.filter_by(
        user_id=current_user.id,
        set_id=data['set_id']
    ).order_by(CompetitionResult.attempts.desc()).first()
    
    # Если это новая попытка или первая
    if not existing_result or data['attempts'] > existing_result.attempts:
        new_result = CompetitionResult(
            user_id=current_user.id,
            set_id=data['set_id'],
            score=data['score'],
            duration_seconds=data['duration_seconds'],
            attempts=data['attempts']
        )
        db.session.add(new_result)
    else:
        # Обновляем существующий результат, если это та же попытка
        existing_result.score = data['score']
        existing_result.duration_seconds = data['duration_seconds']
    
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/set_leaderboard')
def api_set_leaderboard():
    set_id = request.args.get('set_id')
    if not set_id:
        return jsonify({'error': 'Set ID is required'}), 400
    
    # Получаем лучшие результаты для каждого пользователя в этом наборе
    subquery = db.session.query(
        CompetitionResult.user_id,
        db.func.max(CompetitionResult.score).label('max_score')
    ).filter_by(set_id=set_id).group_by(CompetitionResult.user_id).subquery()

    results = db.session.query(
        User.username,
        subquery.c.max_score,
        CompetitionResult.duration_seconds,
        CompetitionResult.created_at
    ).join(
        CompetitionResult,
        (CompetitionResult.user_id == subquery.c.user_id) & 
        (CompetitionResult.score == subquery.c.max_score)
    ).join(
        User,
        User.id == CompetitionResult.user_id
    ).filter(
        CompetitionResult.set_id == set_id
    ).order_by(
        subquery.c.max_score.desc(),
        CompetitionResult.duration_seconds.asc()
    ).all()

    leaderboard = []
    for result in results:
        leaderboard.append({
            'username': result.username,
            'score': result.max_score,
            'duration_seconds': result.duration_seconds,
            'created_at': result.created_at.isoformat()
        })
    
    return jsonify(leaderboard)


@bp.route('/delete_location_global', methods=['POST'])
@login_required
def delete_location_global():
    if not current_user.is_authenticated or current_user.role != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    
    location_id = request.form.get('location_id')
    location = Location.query.get(location_id)
    
    if not location:
        flash('Локация не найдена', 'danger')
        return redirect(url_for('main.admin'))
    
    try:
        if location.image_filename:
            os.remove(os.path.join(Config.UPLOAD_FOLDER, location.image_filename))
        db.session.delete(location)
        db.session.commit()
        flash('Локация успешно удалена', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Ошибка при удалении локации: {str(e)}', 'danger')
    
    return redirect(url_for('main.admin'))


# Добавим эти маршруты в routes.py
@bp.route('/user/set/<int:set_id>', methods=['GET', 'POST'])
@login_required
def manage_set_user(set_id):
    # Get the current set
    current_set = Set.query.get_or_404(set_id)
    
    # Check if user owns this set
    if current_set.creator_id != current_user.id:
        flash('У вас нет прав для управления этим набором', 'danger')
        return redirect(url_for('main.user_page'))

    # Initialize variables
    locations = current_set.locations
    # Get available locations: non-private or created by current user
    available_locations = Location.query.filter(
        (Location.is_private == False) | (Location.creator_id == current_user.id)
    ).all()

    if request.method == 'POST':
        # Handle adding existing location
        if 'add_existing_location' in request.form:
            location_id = request.form['add_existing_location']
            location = Location.query.get(location_id)
            if location and current_set:
                # Check if location is private and not owned by user
                if location.is_private and location.creator_id != current_user.id:
                    flash('Нельзя добавить приватную локацию другого пользователя', 'danger')
                else:
                    current_set.locations.append(location)
                    db.session.commit()
                    flash('Локация успешно добавлена в набор!', 'success')
                return redirect(url_for('main.manage_set_user', set_id=set_id))
            
        # Handle location removal
        if 'remove_location' in request.form:
            location_id = request.form['remove_location']
            location = Location.query.get(location_id)
            if location and current_set:
                current_set.locations.remove(location)
                db.session.commit()
                flash('Локация удалена из набора!', 'warning')
                return redirect(url_for('main.manage_set_user', set_id=set_id))
            
        # Handle new location creation
        if 'add_location' in request.form:
            title = request.form['title']
            lat = request.form['lat']
            lng = request.form['lng']
            description = request.form['description']
            
            file = request.files['image']
            if file and allowed_file(file.filename):
                original_filename = secure_filename(file.filename)
                filename = generate_unique_filename(original_filename)
                
                os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
                file.save(os.path.join(Config.UPLOAD_FOLDER, filename))
                
                new_location = Location(
                    title=title,
                    lat=lat,
                    lng=lng,
                    description=description,
                    image_filename=filename,
                    creator_id=current_user.id,
                    is_private='is_private' in request.form
                )
                db.session.add(new_location)
                current_set.locations.append(new_location)
                db.session.commit()
                flash('Локация успешно добавлена!', 'success')
                return redirect(url_for('main.manage_set_user', set_id=set_id))
        
        # Handle set update
        if 'update_set' in request.form:
            current_set.name = request.form['set_name']
            current_set.competition_count = int(request.form.get('competition_count', 0))
            current_set.max_attempts = int(request.form.get('max_attempts', 3))
            current_set.is_public = 'is_public' in request.form
            db.session.commit()
            flash('Набор успешно обновлен!', 'success')
            return redirect(url_for('main.manage_set_user', set_id=set_id))

    return render_template(
        'manage_set_user.html',
        set=current_set,
        locations=locations,
        available_locations=available_locations
    )

@bp.route('/delete_user_location', methods=['POST'])
@login_required
def delete_user_location():
    location_id = request.form.get('location_id')
    location = Location.query.get(location_id)
    
    if not location:
        flash('Локация не найдена', 'danger')
        return redirect(url_for('main.user_page'))
    
    if location.creator_id != current_user.id:
        flash('Вы не можете удалить эту локацию', 'danger')
        return redirect(url_for('main.user_page'))
    
    try:
        if location.image_filename:
            os.remove(os.path.join(Config.UPLOAD_FOLDER, location.image_filename))
        db.session.delete(location)
        db.session.commit()
        flash('Локация успешно удалена', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Ошибка при удалении локации: {str(e)}', 'danger')
    
    return redirect(url_for('main.user_page'))


@bp.route('/api/set_locations')
def api_set_locations():
    code = request.args.get('code')
    if not code:
        return jsonify({'error': 'Code parameter is required'}), 400
    
    current_set = Set.query.filter_by(code=code).first()
    if not current_set:
        return jsonify({'error': 'Set not found'}), 404
    
    # Используем list() для преобразования динамического запроса
    locations = list(current_set.locations)
    
    return jsonify([{
        'id': loc.id,
        'title': loc.title,
        'description': loc.description,
        'lat': float(loc.lat),
        'lng': float(loc.lng),
        'image_filename': loc.image_filename
    } for loc in locations])

@bp.route('/api/save_competition_attempt', methods=['POST'])
@login_required
def api_save_competition_attempt():
    data = request.get_json()
    if not all(key in data for key in ['set_id', 'attempts']):
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Проверяем, что набор существует
    current_set = Set.query.get(data['set_id'])
    if not current_set:
        return jsonify({'error': 'Set not found'}), 404
    
    # Сохраняем только факт использования попытки
    new_attempt = CompetitionResult(
        user_id=current_user.id,
        set_id=data['set_id'],
        score=0,  # 0 очков, так как пользователь сдался
        duration_seconds=0,  # 0 секунд, так как пользователь сдался
        attempts=data['attempts']
    )
    db.session.add(new_attempt)
    db.session.commit()
    
    return jsonify({'success': True})