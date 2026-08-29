begin;

update public.places
set category = case category
  when 'Природа / парк' then 'nature' when 'Природа / смотровая' then 'nature'
  when 'Храм / святилище' then 'temple' when 'Храм / подземелье' then 'temple' when 'Пещера / священное место' then 'temple'
  when 'Музей' then 'museum' when 'Музей / галерея' then 'museum' when 'Музей / oddity' then 'museum' when 'Музей / архитектура' then 'museum' when 'Музей / индустриальное наследие' then 'museum'
  when 'Еда / напитки' then 'food' when 'Архитектура / историческое' then 'architecture' when 'Архитектура / искусство' then 'architecture'
  when 'Улица / район' then 'neighborhood' when 'Развлечения / тематическое' then 'entertainment' when 'Тематический парк' then 'entertainment' when 'Тематический парк / oddity' then 'entertainment'
  when 'Транспорт / станция' then 'transport' when 'Магазин' then 'shop' when 'Магазин / арт-пространство' then 'shop' when 'Магазин / мастерская' then 'shop'
  when 'Животные / аквариум' then 'animals' when 'Зоопарк / аквариум' then 'animals' when 'Онсэн / сэнто' then 'bath'
  when 'Руины / индустриальное' then 'ruins' when 'Руины / историческое' then 'ruins' when 'Городские руины / инфраструктура' then 'ruins' when 'Пещера / индустриальное' then 'ruins'
  when 'Пещера / подземелье' then 'cave' when 'Отель / рёкан' then 'lodging' when 'Фото / студия' then 'photo'
  when 'Фото / публичный объект' then 'monument' when 'Книги / культурное пространство' then 'books' when 'Библиотека / книги' then 'books'
  when 'История / памятник' then 'monument' when 'Наука / техника' then 'science' when 'Другое' then 'other'
  else case
    when category in (
      'nature','temple','museum','food','architecture','neighborhood','entertainment',
      'transport','shop','animals','bath','ruins','cave','lodging','photo','books',
      'monument','science','other'
    ) then category
    else 'other'
  end
end;

alter table public.places drop constraint if exists places_category_check;
alter table public.places add constraint places_category_check check (category in (
  'nature','temple','museum','food','architecture','neighborhood','entertainment',
  'transport','shop','animals','bath','ruins','cave','lodging','photo','books',
  'monument','science','other'
));

commit;
